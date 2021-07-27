import {
  mapSchema,
  getDirectives,
  MapperKind,
  mergeSchemas,
  getFieldsWithDirectives,
  getDocumentNodeFromSchema,
  extractType,
  cloneType,
  renameType,
  getUserTypesFromSchema,
  wrapSchema,
  RenameObjectFields,
  TransformObjectFields,
  TransformInterfaceFields,
} from 'graphql-tools'
import {
  GraphQLSchema,
  GraphQLNamedType,
  GraphQLField,
  GraphQLOutputType,
  GraphQLObjectType,
  TypeNode,
  print,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLScalarType,
  FieldDefinitionNode,
} from 'graphql'

export default function connectionDirective(directiveName: string) {
  return {
    connectionDirectiveTypeDefs: `directive @${directiveName} on FIELD_DEFINITION`,
    connectionDirectiveTransform: (schema: GraphQLSchema) => {
      const newTypeDefs = []
      const foundTypes: { [name: string]: GraphQLNamedType } = {}
      const connectionTypes: { [name: string]: boolean } = {}
      const markedLocations: { [name: string]: string } = {}

      // Perform visitations:
      const visitor = (
        fieldConfig: GraphQLFieldConfig<any, any>,
        fieldName: string,
        typeName: string
      ) => {
        const directives = getDirectives(schema, fieldConfig)

        if (directives.connection) {
          const baseName = getBaseType(fieldConfig.type.toString())
          connectionTypes[baseName] = true
          markedLocations[`${typeName}.${fieldName}`] = baseName + 'Connection'
          // fieldConfig.type = makeConnectionType(fieldConfig.type) // does not work
          // return fieldConfig
        }

        return undefined
      }
      mapSchema(schema, {
        [MapperKind.TYPE]: (type) => {
          foundTypes[type.name] = type
          return undefined
        },
        [MapperKind.INTERFACE_FIELD]: visitor,
        [MapperKind.OBJECT_FIELD]: visitor,
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
        let cacheControl = ''
        // const currentCacheValue = foundCacheControl[typeName]
        // const currentMaxAge: string | undefined = Number(
        //   currentCacheValue?.maxAge
        // )
        //   ? `maxAge: ${currentCacheValue.maxAge}`
        //   : undefined
        // cacheControl = currentMaxAge
        //   ? `@cacheControl(${currentMaxAge || ''})`
        //   : ''

        const newEdgeName = `${name}Edge`
        if (!foundTypes[newEdgeName]) {
          newTypeDefs.push(`
            type ${newEdgeName} ${cacheControl} {
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
              edges: [${newEdgeName}] ${cacheControl}
              pageInfo: PageInfo! ${cacheControl}
            }
          `)
        }
      }

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
