import { validateSchema } from 'graphql'
import { makeExecutableSchema } from 'graphql-tools'
import { applyConnectionTransform, directiveDeclaration } from '../src'

test('main test', () => {
  const typeDefs = `
    ${directiveDeclaration}
    directive @sql on FIELD_DEFINITION

    type User {
      userId: Int
      smallPosts: Post @connection
      posts: [Post!]! @sql @connection
      bigPosts: [Post!]! @connection @sql 
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
  // console.log(JSON.stringify(newTypeDefs))
  expect(newTypeDefs).toBe(
    'type PageInfo {\n  hasNextPage: Boolean!\n  hasPreviousPage: Boolean!\n  startCursor: String\n  endCursor: String\n}\ntype PostEdge {\n  cursor: String!\n  node: Post\n}\ntype PostConnection {\n  edges: [PostEdge]\n  pageInfo: PageInfo!\n}\n\n    directive @sql on FIELD_DEFINITION\n\n    type User {\n      userId: Int\n      smallPosts: PostConnection\n      posts: PostConnection @sql\n      bigPosts: PostConnection @sql \n    }\n\n    type Post {\n      postId: Int\n    }\n\n    type Query {\n      user: User\n    }'
  )
  const finalSchema = makeExecutableSchema({
    typeDefs,
  })
  const errors = validateSchema(finalSchema)
  expect(errors.length).toBe(0)
})
