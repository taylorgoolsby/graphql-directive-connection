import test from 'boxtape'
import {makeExecutableSchema} from '@graphql-tools/schema'
import { printSchemaWithDirectives } from '@graphql-tools/utils'
import connectionDirective from '../lib/index.js'

const {
  connectionDirectiveTypeDefs,
  connectionDirectiveTransform,
} = connectionDirective('connection', { useCacheControl: true })

test('cacheControl test', (t) => {
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

type PostEdge @cacheControl(maxAge: 20) {
  cursor: String!
  node: Post
}

type PostConnection {
  totalCount: Int!
  edges: [PostEdge] @cacheControl(maxAge: 20)
  pageInfo: PageInfo! @cacheControl(maxAge: 20)
}`
  runTest(t, typeDefs, expected)
})

function runTest(t, typeDefs, expected) {
  let schema = makeExecutableSchema({
    typeDefs: [connectionDirectiveTypeDefs, typeDefs],
  })
  schema = connectionDirectiveTransform(schema)
  const answer = printSchemaWithDirectives(schema)

  if (answer !== expected) {
    console.log(answer)
  }

  t.equal(answer, expected)
}
