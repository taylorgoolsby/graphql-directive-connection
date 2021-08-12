import { validateSchema } from 'graphql'
import { makeExecutableSchema, printSchemaWithDirectives } from 'graphql-tools'
import connectionDirective from '../src'

const {
  connectionDirectiveTypeDefs,
  connectionDirectiveTransform,
} = connectionDirective('connection')

test('main test', () => {
  const typeDefs = `
    directive @sql on FIELD_DEFINITION

    interface Account {
      interfacePosts: Post @connection
    }

    type User implements Account {
      userId: Int
      smallPosts: Post @connection
      posts: [Post!]! @sql @connection
      bigPosts: [Post!]! @connection @sql
      multilinePosts(
        myArg: String
      ): Post @connection
      inlinePosts(myArg: String): Post @connection
      # ignoredPost: Post @connection
      interfacePosts: Post @connection
    }
    
    extend type User {
      extendedField: Post @connection
    }

    type Post {
      postId: Int
    }

    type Query {
      user: User
    }
  `
  const expected = `schema {
  query: Query
}

directive @connection on FIELD_DEFINITION

directive @sql on FIELD_DEFINITION

interface Account {
  interfacePosts(after: String, first: Int, before: String, last: Int): PostConnection
}

type User implements Account {
  userId: Int
  smallPosts(after: String, first: Int, before: String, last: Int): PostConnection
  posts(after: String, first: Int, before: String, last: Int): PostConnection @sql
  bigPosts(after: String, first: Int, before: String, last: Int): PostConnection @sql
  multilinePosts(myArg: String, after: String, first: Int, before: String, last: Int): PostConnection
  inlinePosts(myArg: String, after: String, first: Int, before: String, last: Int): PostConnection
  """ignoredPost: Post @connection"""
  interfacePosts(after: String, first: Int, before: String, last: Int): PostConnection
  extendedField(after: String, first: Int, before: String, last: Int): PostConnection
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
`
  runTest(typeDefs, expected)
})

function runTest(typeDefs: string, expected: string) {
  let schema = makeExecutableSchema({
    typeDefs: [connectionDirectiveTypeDefs, typeDefs],
  })
  schema = connectionDirectiveTransform(schema)
  const answer = printSchemaWithDirectives(schema)

  if (answer !== expected) {
    console.log(answer)
  }

  expect(answer).toEqual(expected)
}
