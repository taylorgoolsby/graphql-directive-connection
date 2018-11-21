import { validateSchema } from 'graphql'
import { makeExecutableSchema } from 'graphql-tools'
import { applyConnectionTransform, connectionDirectiveDeclaration } from '../src'

test('main test', () => {
  const typeDefs = `
    ${connectionDirectiveDeclaration}
    directive @sql on FIELD_DEFINITION

    type User {
      userId: Int
      smallPosts: Post @connection
      posts: [Post!]! @sql @connection
      bigPosts: [Post!]! @connection @sql
      multilinePosts(
        myArg: String
      ): Post @connection
      inlinePosts(myArg: String): Post @connection
      # ignoredPost: Post @connection
    }

    type Post {
      postId: Int
    }

    type Query {
      user: User
    }
  `

  const newTypeDefs = applyConnectionTransform({
    typeDefs,
  })
  // console.log('final', JSON.stringify(newTypeDefs))
  expect(newTypeDefs).toBe(
    "type PageInfo {\n  hasNextPage: Boolean!\n  hasPreviousPage: Boolean!\n  startCursor: String\n  endCursor: String\n}\n\ntype PostEdge {\n  cursor: String!\n  node: Post\n}\n\ntype PostConnection {\n  edges: [PostEdge]\n  pageInfo: PageInfo!\n}\n\ndirective @connection on FIELD_DEFINITION\n\ndirective @sql on FIELD_DEFINITION\n\ntype User {\n  userId: Int\n  smallPosts(after: String, first: Int, before: String, last: Int): PostConnection\n  posts(after: String, first: Int, before: String, last: Int): PostConnection @sql\n  bigPosts(after: String, first: Int, before: String, last: Int): PostConnection @sql\n  multilinePosts(myArg: String, after: String, first: Int, before: String, last: Int): PostConnection\n  inlinePosts(myArg: String, after: String, first: Int, before: String, last: Int): PostConnection\n}\n\ntype Post {\n  postId: Int\n}\n\ntype Query {\n  user: User\n}\n"
  )
  const finalSchema = makeExecutableSchema({
    typeDefs,
  })
  const errors = validateSchema(finalSchema)
  expect(errors.length).toBe(0)
})
