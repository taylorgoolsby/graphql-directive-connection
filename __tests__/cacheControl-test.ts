import { makeExecutableSchema, printSchemaWithDirectives } from 'graphql-tools'
import connectionDirective from '../src'

const {
  connectionDirectiveTypeDefs,
  connectionDirectiveTransform,
} = connectionDirective('connection', { useCacheControl: true })

test('cacheControl test', () => {
  const typeDefs = `
    directive @sql on FIELD_DEFINITION
    directive @cacheControl (
      maxAge: Int
      scope: CacheControlScope
    ) on FIELD_DEFINITION | OBJECT | INTERFACE
    enum CacheControlScope {
      PUBLIC
      PRIVATE
    }

    type User {
      userId: Int
      shortPosts: [Post] @connection @cacheControl(maxAge: 10)
      longPosts: [Post] @connection @cacheControl(maxAge: 0)
    }

    type Post @cacheControl(maxAge: 20) {
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

directive @cacheControl(maxAge: Int, scope: CacheControlScope) on FIELD_DEFINITION | OBJECT | INTERFACE

enum CacheControlScope {
  PUBLIC
  PRIVATE
}

type User {
  userId: Int
  shortPosts(after: String, first: Int, before: String, last: Int): PostConnection @cacheControl(maxAge: 10)
  longPosts(after: String, first: Int, before: String, last: Int): PostConnection @cacheControl(maxAge: 0)
}

type Post @cacheControl(maxAge: 20) {
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

type PostEdge @cacheControl(maxAge: 10) {
  cursor: String!
  node: Post
}

type PostConnection {
  totalCount: Int!
  edges: [PostEdge] @cacheControl(maxAge: 10)
  pageInfo: PageInfo! @cacheControl(maxAge: 10)
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
