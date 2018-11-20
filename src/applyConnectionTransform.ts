import { printSchema } from 'graphql'
import {
  SchemaDirectiveVisitor,
  makeExecutableSchema,
  transformSchema,
  concatenateTypeDefs,
  ITypeDefinitions,
  Transform,
} from 'graphql-tools'
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLField,
  GraphQLDirective,
  DirectiveLocation,
  GraphQLString,
  GraphQLBoolean,
  DocumentNode,
  TypeNode,
  NameNode,
  extendSchema,
} from 'graphql'
import gql from 'graphql-tag'

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

function getBaseType(type: string): string {
  return type
    .replace(/:/g, '')
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .replace(/!/g, '')
    .replace(/@/g, '')
    .trim()
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
  let mergedTypeDefs = concatenateTypeDefs(a)

  // point to new Connection type
  const regex = new RegExp(`\\S+:.*@${directiveName}`, 'gm')
  const fieldsWithConnectionDirective = mergedTypeDefs.match(regex) || []
  for (const fieldMatch of fieldsWithConnectionDirective) {
    // there might be other directives. get only the part to change
    const parts = fieldMatch.match(/[^:@]+/g) || []
    const fieldName = parts[0]
    const typePart = parts[1].trim()
    const baseType = getBaseType(typePart)
    const newPart = `${fieldName}: ${baseType}Connection`
    const partToChange = `${fieldName}: ${typePart}`
    mergedTypeDefs = mergedTypeDefs.replace(partToChange, newPart)
  }
  // remove @connection
  mergedTypeDefs = mergedTypeDefs.replace(
    new RegExp(`directive\\s+@${directiveName}\\s+on\\s+FIELD_DEFINITION`, 'g'),
    ''
  )
  const directiveRegex = new RegExp(`\\s@${directiveName}`, 'gm')
  mergedTypeDefs = mergedTypeDefs.replace(directiveRegex, '')

  return mergedTypeDefs
}

// todo handle hide by using Schema Transforms to filter types marked with hide

export const directiveDeclaration = `directive @connection on FIELD_DEFINITION`
