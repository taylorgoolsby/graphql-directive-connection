
// import connectionDirective from 'graphql-directive-connection'
import connectionDirective from './lib/index.js'
import { makeExecutableSchema, printSchemaWithDirectives } from 'graphql-tools'

const {
  connectionDirectiveTypeDefs,
  connectionDirectiveTransform,
} = connectionDirective('connection')

const typeDefs = `
  type User {
    userId: Int
    smallPosts: Post @connection
    posts: [Post!]! @connection
    bigPosts: [Post!]! @connection
  }

  type Post {
    postId: Int
  }

  type Query {
    user: User
  }
`

const schema = makeExecutableSchema({
  typeDefs: [connectionDirectiveTypeDefs, typeDefs],
})

const connectionSchema = connectionDirectiveTransform(schema)
const newTypeDefs = printSchemaWithDirectives(connectionSchema)
console.log(newTypeDefs)

/* console.log(newTypeDefs)
schema {
  query: Query
}

directive @connection on FIELD_DEFINITION

type User {
  userId: Int
  smallPosts(after: String, first: Int, before: String, last: Int): PostConnection
  posts(after: String, first: Int, before: String, last: Int): PostConnection
  bigPosts(after: String, first: Int, before: String, last: Int): PostConnection
}

type Post {
  postId: Int
}

type Query {
  user: User
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type PostEdge {
  cursor: String!
  node: Post
}

type PostConnection {
  totalCount: Int!
  edges: [PostEdge]
  pageInfo: PageInfo!
}
* */