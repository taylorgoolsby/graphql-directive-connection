import { validateSchema } from 'graphql'
import { makeExecutableSchema } from 'graphql-tools'
import {
  applyConnectionTransform,
  connectionDirectiveDeclaration,
} from '../src'
import { booleanLiteral } from '@babel/types'

test('cacheControl test', () => {
  const typeDefs = `
    ${connectionDirectiveDeclaration}
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
      smallPosts: Post @connection @cacheControl(maxAge: 10)
      posts: [Post!]! @sql @connection
      bigPosts: [Post!]! @connection @sql
      multilinePosts(
        myArg: String
      ): Post @connection @cacheControl(maxAge: 0)
      inlinePosts(myArg: String): Post @connection
      # ignoredPost: Post @connection
    }

    type Post @cacheControl(maxAge: 20) {
      postId: Int
    }

    type Query {
      user: User
    }
  `

  const newTypeDefs = applyConnectionTransform({
    typeDefs,
    useCacheControl: true,
  })
  expect(newTypeDefs).toBe(
    'type PageInfo {\n  hasNextPage: Boolean!\n  hasPreviousPage: Boolean!\n  startCursor: String\n  endCursor: String\n}\n\ntype PostEdge @cacheControl(maxAge: 10) {\n  cursor: String!\n  node: Post\n}\n\ntype PostConnection {\n  totalCount: Int!\n  edges: [PostEdge] @cacheControl(maxAge: 10)\n  pageInfo: PageInfo! @cacheControl(maxAge: 10)\n}\n\ndirective @connection on FIELD_DEFINITION\n\ndirective @sql on FIELD_DEFINITION\n\ndirective @cacheControl(maxAge: Int, scope: CacheControlScope) on FIELD_DEFINITION | OBJECT | INTERFACE\n\nenum CacheControlScope {\n  PUBLIC\n  PRIVATE\n}\n\ntype User {\n  userId: Int\n  smallPosts(after: String, first: Int, before: String, last: Int): PostConnection @cacheControl(maxAge: 10)\n  posts(after: String, first: Int, before: String, last: Int): PostConnection @sql\n  bigPosts(after: String, first: Int, before: String, last: Int): PostConnection @sql\n  multilinePosts(myArg: String, after: String, first: Int, before: String, last: Int): PostConnection @cacheControl(maxAge: 0)\n  inlinePosts(myArg: String, after: String, first: Int, before: String, last: Int): PostConnection\n}\n\ntype Post @cacheControl(maxAge: 20) {\n  postId: Int\n}\n\ntype Query {\n  user: User\n}\n'
  )
  const finalSchema = makeExecutableSchema({ typeDefs })
  const errors = validateSchema(finalSchema)
  expect(errors.length).toBe(0)
})
