import {
  FieldDefinitionNode,
  InputValueDefinitionNode,
  TypeNode,
  DirectiveNode,
  ArgumentNode,
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

export interface IGetSchemaDirectivesInput {
  typeDefs: string | DocumentNode
  overrideDirectiveName?: string
  useCacheControl?: boolean
}

export interface IFoundObjectTypes {
  [objectTypeName: string]: string
}
export interface IFoundConnections {
  [typeName: string]: string
}

export interface ICacheValue {
  maxAge: number | undefined
}

export interface ICacheControlDirectives {
  [typeName: string]: ICacheValue
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
  useCacheControl = false,
}: IGetSchemaDirectivesInput): string {
  const directiveName = overrideDirectiveName || 'connection'

  const foundObjectTypes: IFoundObjectTypes = {}
  const foundConnections: IFoundConnections = {}
  const foundCacheControl: ICacheControlDirectives = {}

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

      // CacheControl
      // By default, cacheControl directives are lost when creating connections.
      // In case `useCacheControl` is enabled, it will search for cache directives,
      // and apply them to new type defs.
      if (useCacheControl)
        foundCacheControl[fieldTypeName] = extractCacheControlDirectives(
          foundCacheControl[fieldTypeName],
          field.astNode?.directives
        )
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
  // console.log('cacheControlDirectives', foundCacheControl)

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

    // This applies the cacheControl to Edge type and edges, pageInfo fields
    // The cacheControl is not applied to a Connection and Node types
    // to comply with GraphQL List cacheControl behavior which has disabled cache by default
    let cacheControl = ''
    if (useCacheControl) {
      const currentCacheValue: ICacheValue = foundCacheControl[typeName]
      const currentMaxAge: string | undefined = Number(
        currentCacheValue?.maxAge
      )
        ? `maxAge: ${currentCacheValue.maxAge}`
        : undefined
      cacheControl = currentMaxAge
        ? `@cacheControl(${currentMaxAge || ''})`
        : ''
    }

    newTypeDefs.push(
      gql`
        type ${typeName}Edge ${cacheControl} {
          cursor: String!
          node: ${typeName}
        }
      `
    )
    newTypeDefs.push(
      gql`
        type ${typeName}Connection {
          totalCount: Int!
          edges: [${typeName}Edge] ${cacheControl}
          pageInfo: PageInfo! ${cacheControl}
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

function findDirectiveField(directives: readonly any[], field: string): any {
  return directives.find((d: any) => d.name.value === field)
}

// This code will search for the large `maxAge`.
// Using the biggest maxAge ensures that the cache TTL for the Connection type
// among different fields would never be unpredictably lowered.
// The `scope` is ignored since a missing scope does not affect GraphQL cache policy.
function extractCacheControlDirectives(
  storedCacheValue: ICacheValue,
  directives: readonly DirectiveNode[] = []
): ICacheValue {
  const directive: DirectiveNode | undefined = findDirectiveField(
    directives,
    'cacheControl'
  )
  const args: readonly ArgumentNode[] = directive?.arguments || []
  const directiveCacheValue: ICacheValue = {
    maxAge: findDirectiveField(args, 'maxAge')?.value.value,
  }
  let currentCacheValue = storedCacheValue
  if (
    storedCacheValue?.maxAge === undefined ||
    Number(directiveCacheValue?.maxAge) > Number(storedCacheValue?.maxAge)
  )
    currentCacheValue = {
      ...currentCacheValue,
      maxAge: directiveCacheValue?.maxAge,
    }
  return currentCacheValue
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
