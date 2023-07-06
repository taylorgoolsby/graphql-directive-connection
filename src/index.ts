import {
  mapSchema,
  getDirectives,
  MapperKind,
  printSchemaWithDirectives,
} from '@graphql-tools/utils'
// import {stitchSchemas} from '@graphql-tools/stitch'
import {
  wrapSchema,
  TransformObjectFields,
  TransformInterfaceFields,
} from '@graphql-tools/wrap'
import {
  GraphQLSchema,
  GraphQLNamedType,
  GraphQLOutputType,
  GraphQLObjectType,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLScalarType,
  GraphQLSchemaConfig,
  GraphQLObjectTypeConfig,
  GraphQLInterfaceTypeConfig,
  GraphQLUnionTypeConfig,
  GraphQLScalarTypeConfig,
  GraphQLEnumTypeConfig,
  GraphQLEnumValue,
  GraphQLEnumValueConfig,
  GraphQLInputObjectTypeConfig,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputFieldConfig,
} from 'graphql'
import { makeExecutableSchema, mergeSchemas } from '@graphql-tools/schema'

type DirectableGraphQLObject =
  | GraphQLSchema
  | GraphQLSchemaConfig
  | GraphQLNamedType
  | GraphQLObjectTypeConfig<any, any>
  | GraphQLInterfaceTypeConfig<any, any>
  | GraphQLUnionTypeConfig<any, any>
  | GraphQLScalarTypeConfig<any, any>
  | GraphQLEnumTypeConfig
  | GraphQLEnumValue
  | GraphQLEnumValueConfig
  | GraphQLInputObjectTypeConfig
  | GraphQLField<any, any>
  | GraphQLInputField
  | GraphQLFieldConfig<any, any>
  | GraphQLInputFieldConfig

export type ConnectionDirectiveOptions = {
  useCacheControl?: boolean
}

export default function connectionDirective(
  directiveName: string,
  options?: ConnectionDirectiveOptions
) {
  return {
    connectionDirectiveTypeDefs: `directive @${directiveName} on FIELD_DEFINITION`,
    connectionDirectiveTransform: (schema: GraphQLSchema) => {
      const newTypeDefs = []
      const foundTypes: { [name: string]: GraphQLNamedType } = {}
      const connectionTypes: { [name: string]: boolean } = {}
      const markedLocations: { [name: string]: string } = {}

      // variables for cacheControl:
      const connectionTypeGreatestMaxAge: {
        [returnTypeName: string]: number
      } = {}

      function handleCacheControlDirectiveVisitation(
        node: DirectableGraphQLObject,
        typeName: string
      ) {
        const directives = getDirectives(schema, node)
        const cacheControlDirective = directives?.find(
          (d) => d.name === 'cacheControl'
        )
        if (cacheControlDirective) {
          const maxAge = cacheControlDirective.args?.maxAge

          if (typeof maxAge === 'number') {
            const baseName = getBaseType(typeName)
            if (
              !connectionTypeGreatestMaxAge.hasOwnProperty(baseName) ||
              maxAge > connectionTypeGreatestMaxAge[baseName]
            ) {
              connectionTypeGreatestMaxAge[baseName] = maxAge
            }
          }
        }
      }

      // Perform visitations:
      const fieldVisitor = (
        fieldConfig: GraphQLFieldConfig<any, any>,
        fieldName: string,
        typeName: string
      ) => {
        const directives = getDirectives(schema, fieldConfig)

        const directive = directives?.find((d) => d.name === directiveName)

        if (directive) {
          const baseName = getBaseType(fieldConfig.type.toString())
          connectionTypes[baseName] = true
          markedLocations[`${typeName}.${fieldName}`] = baseName + 'Connection'
        }

        handleCacheControlDirectiveVisitation(
          fieldConfig,
          fieldConfig.type.toString()
        )

        return undefined
      }
      mapSchema(schema, {
        [MapperKind.TYPE]: (type) => {
          handleCacheControlDirectiveVisitation(type, type.name)
          foundTypes[type.name] = type
          return undefined
        },
        [MapperKind.INTERFACE_FIELD]: fieldVisitor,
        [MapperKind.OBJECT_FIELD]: fieldVisitor,
      })

      // Construct new types:

      if (!foundTypes['PageInfo']) {
        newTypeDefs.push(`
          type PageInfo {
            hasNextPage: Boolean!
            hasPreviousPage: Boolean!
            startCursor: String
            endCursor: String
          }
        `)
      }

      for (const name of Object.keys(connectionTypes)) {
        // This applies the cacheControl to Edge type and edges, pageInfo fields
        // The cacheControl is not applied to a Connection and Node types
        // to comply with GraphQL List cacheControl behavior which has disabled cache by default
        const maxAge = connectionTypeGreatestMaxAge[name]
        const needsCacheControl =
          options?.useCacheControl && typeof maxAge === 'number'
        const cacheControl = needsCacheControl
          ? ` @cacheControl(maxAge: ${maxAge})`
          : ''

        const newEdgeName = `${name}Edge`
        if (!foundTypes[newEdgeName]) {
          newTypeDefs.push(`
            type ${newEdgeName}${cacheControl} {
              cursor: String!
              node: ${name}
            }
          `)
        }

        const newConnectionName = `${name}Connection`
        if (!foundTypes[newConnectionName]) {
          newTypeDefs.push(`
            type ${newConnectionName} {
              totalCount: Int!
              edges: [${newEdgeName}]${cacheControl}
              pageInfo: PageInfo!${cacheControl}
            }
          `)
        }
      }

      // Add new types to the existing schema
      schema = mergeSchemas({
        schemas: [schema],
        typeDefs: newTypeDefs,
      })

      // Rename field types.
      const transformer = (
        typeName: string,
        fieldName: string,
        fieldConfig: GraphQLFieldConfig<any, any>
      ) => {
        const mark = markedLocations[`${typeName}.${fieldName}`]
        if (mark) {
          fieldConfig.type = makeConnectionType(fieldConfig.type)
          fieldConfig.args = {
            ...fieldConfig.args,
            ...makeConnectionArgs(),
          }
          const remainingDirectives = fieldConfig?.astNode?.directives?.filter(
            (dir) => dir.name.value !== directiveName
          )
          fieldConfig.astNode = {
            ...fieldConfig.astNode,
            directives: remainingDirectives,
          } as any
          return fieldConfig
        } else return undefined
      }
      schema = wrapSchema({
        schema,
        transforms: [
          new TransformInterfaceFields(transformer),
          new TransformObjectFields(transformer),
        ],
      })

      return schema
    },
  }
}

function getBaseType(type?: string): string {
  if (!type) return ''
  if (typeof type !== 'string') return ''
  return type
    .replace(/:/g, '')
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .replace(/!/g, '')
    .replace(/@/g, '')
    .trim()
}

function makeConnectionType(type: GraphQLOutputType): GraphQLOutputType {
  const formattedType = type.toString()
  const baseName = getBaseType(formattedType)
  return new GraphQLObjectType({
    name: `${baseName}Connection`,
    fields: {},
  })
}

function makeConnectionArgs(): GraphQLFieldConfigArgumentMap {
  return {
    after: {
      type: new GraphQLScalarType({
        name: 'String',
      }),
    },
    first: {
      type: new GraphQLScalarType({
        name: 'Int',
      }),
    },
    before: {
      type: new GraphQLScalarType({
        name: 'String',
      }),
    },
    last: {
      type: new GraphQLScalarType({
        name: 'Int',
      }),
    },
  }
}
