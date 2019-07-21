import {
  FieldDefinitionNode,
  InputValueDefinitionNode,
  TypeNode,
} from 'graphql'
import {
  SchemaDirectiveVisitor,
  makeExecutableSchema,
  concatenateTypeDefs,
} from 'graphql-tools'
import {
  GraphQLSchema,
  GraphQLField,
  GraphQLDirective,
  DirectiveLocation,
  DocumentNode,
  ObjectTypeDefinitionNode,
  print,
} from 'graphql'
import gql from 'graphql-tag'
import { write } from 'fs-extra'

export interface IGetSchemaDirectivesInput {
  typeDefs: string | DocumentNode
  overrideDirectiveName?: string
}

export interface IFoundObjectTypes {
  [objectTypeName: string]: string
}
export interface IFoundConnections {
  [typeName: string]: string
}

// The goal of this package is to create the Connection and Edge types,
// remove any @connection directives,
// and point any fields that had @connection to the newly generated
// Connection type,
// all the while leaving everything else in the original typeDef exactly
// the same.
// It will also optionally generate the PageInfo type.
export function applyConnectionTransform({
  typeDefs,
  overrideDirectiveName,
}: IGetSchemaDirectivesInput): string {
  const directiveName = overrideDirectiveName || 'connection'

  const foundObjectTypes: IFoundObjectTypes = {}
  const foundConnections: IFoundConnections = {}
  class ConnectionDirective extends SchemaDirectiveVisitor {
    public static getDirectiveDeclaration(
      name: string,
      schema: GraphQLSchema
    ): GraphQLDirective {
      return new GraphQLDirective({
        name,
        locations: [DirectiveLocation.FIELD_DEFINITION],
      })
    }

    public visitFieldDefinition(field: GraphQLField<any, any>, details: any) {
      const objectTypeName = details.objectType.name
      foundObjectTypes[objectTypeName] = objectTypeName

      const fieldTypeName = getBaseType(field.type.toString())
      foundConnections[fieldTypeName] = fieldTypeName
    }
  }

  // use makeExecutableSchema to run through typeDefs once to find usages of @connection
  makeExecutableSchema({
    typeDefs,
    schemaDirectives: {
      [directiveName]: ConnectionDirective,
    },
    resolverValidationOptions: { requireResolversForResolveType: false },
  })
  // console.log('foundObjectTypes', foundObjectTypes)
  // console.log('foundConnections', foundConnections)

  // create the typeDefs for the Connection, Edge, and PageInfo types
  const newTypeDefs = []
  if (!foundObjectTypes.PageInfo) {
    newTypeDefs.push(
      gql`
        type PageInfo {
          hasNextPage: Boolean!
          hasPreviousPage: Boolean!
          startCursor: String
          endCursor: String
        }
      `
    )
  }
  for (const typeName in foundConnections) {
    if (!foundConnections.hasOwnProperty(typeName)) {
      continue
    }

    const connectionName = `${typeName}Connection`
    const edgeName = `${typeName}Edge`
    if (!!foundObjectTypes[connectionName]) {
      throw new Error(`${connectionName} already exists.`)
    }
    if (!!foundObjectTypes[edgeName]) {
      throw new Error(`${edgeName} already exists.`)
    }
    newTypeDefs.push(
      gql`
        type ${typeName}Edge {
          cursor: String!
          node: ${typeName}
        }
      `
    )
    newTypeDefs.push(
      gql`
        type ${typeName}Connection {
          totalCount: Integer!
          edges: [${typeName}Edge]
          pageInfo: PageInfo!
        }
      `
    )
  }

  const originalTypeDefsAsArray = Array.isArray(typeDefs)
    ? typeDefs
    : [typeDefs]
  const a = newTypeDefs.concat(originalTypeDefsAsArray)
  const mergedTypeDefs = concatenateTypeDefs(a)
  const document = gql(mergedTypeDefs)
  const objects = getObjectTypeDefinitions(document)
  objects.forEach(o =>
    getFieldsWithConnectionDirective(o, directiveName).forEach(f => {
      const openField = f as any
      // add relay connection args
      const args = openField.arguments || []
      makeConnectionArgs().forEach(arg => args.push(arg))

      // Change type to Connection
      openField.type = makeConnectionType(f.type)

      // remove @connection directive
      const directiveIndex = openField.directives.findIndex(
        (d: any) => d.name.value === directiveName
      )
      openField.directives.splice(directiveIndex, 1)
    })
  )

  // mergedTypeDefs = mergedTypeDefs.replace(directiveRegex, '')
  const formattedTypeDefs = print(document)

  return formattedTypeDefs
}

function getObjectTypeDefinitions(
  document: DocumentNode
): ObjectTypeDefinitionNode[] {
  return document.definitions.filter(
    d => d.kind === 'ObjectTypeDefinition'
  ) as ObjectTypeDefinitionNode[]
}

function getFieldsWithConnectionDirective(
  object: ObjectTypeDefinitionNode,
  directiveName: string
): FieldDefinitionNode[] {
  if (!object.fields) {
    return []
  }
  return object.fields.filter(f => {
    if (!f.directives) {
      return false
    }
    for (const d of f.directives) {
      if (d.name.value === directiveName) {
        return true
      }
    }
    return false
  })
}

function getBaseType(type: string): string {
  return type
    .replace(/:/g, '')
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .replace(/!/g, '')
    .replace(/@/g, '')
    .trim()
}

function makeConnectionType(type: TypeNode): TypeNode {
  const formattedType = print(type)
  const baseName = getBaseType(formattedType)
  return {
    kind: 'NamedType',
    name: {
      kind: 'Name',
      value: `${baseName}Connection`,
    },
  }
}

function makeConnectionArgs(): InputValueDefinitionNode[] {
  return [
    {
      kind: 'InputValueDefinition',
      name: {
        kind: 'Name',
        value: 'after',
      },
      type: {
        kind: 'NamedType',
        name: {
          kind: 'Name',
          value: 'String',
        },
      },
    },
    {
      kind: 'InputValueDefinition',
      name: {
        kind: 'Name',
        value: 'first',
      },
      type: {
        kind: 'NamedType',
        name: {
          kind: 'Name',
          value: 'Int',
        },
      },
    },
    {
      kind: 'InputValueDefinition',
      name: {
        kind: 'Name',
        value: 'before',
      },
      type: {
        kind: 'NamedType',
        name: {
          kind: 'Name',
          value: 'String',
        },
      },
    },
    {
      kind: 'InputValueDefinition',
      name: {
        kind: 'Name',
        value: 'last',
      },
      type: {
        kind: 'NamedType',
        name: {
          kind: 'Name',
          value: 'Int',
        },
      },
    },
  ]
}

// todo handle hide by using Schema Transforms to filter types marked with hide
export function customDirectiveDeclaration(
  customDirectiveName: string
): string {
  return `directive @${customDirectiveName} on FIELD_DEFINITION`
}
export const connectionDirectiveDeclaration = customDirectiveDeclaration(
  'connection'
)
