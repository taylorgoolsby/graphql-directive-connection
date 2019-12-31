# graphql-directive-connection

This package generates relay connections by marking fields with a `@connection` directive, and then passing your SDL through `applyConnectionTransform`.

## Example

```
// usage
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
```

```
# output
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
  edges: [PostEdge]
  pageInfo: PageInfo!
}

directive @connection on FIELD_DEFINITION
directive @sql on FIELD_DEFINITION

type User {
  userId: Int
  smallPosts: PostConnection
  posts: PostConnection @sql
  bigPosts: PostConnection @sql 
}

type Post {
  postId: Int
}

type Query {
  user: User
}
```

It will:
* Create the needed Connection and Edge object types.
* Reassign the type of marked fields to the Connection type.
* Remove any `@connection` directives.
* Generate the PageInfo object type if it hasn't been defined.
* Throw errors if the generated Connection and Edge types have a name conflict with types already defined in your SDL.
* Leave everything else in your SDL untouched.

## cacheControl

By default the `cacheControl` directives are not generated on Edge object types and inside connection fields which results in cache arguments being completely ignored.
Enabling `defaultMaxAge` for all types/fields across your GraphQL implementation partially solve the problem, however it might not be the best options.
It is possible to enable `cacheControl` directive support by passing a `useCacheControl: true` flag to `applyConnectionTransform` function.
The package will then use the largest `maxAge` across the connection fields with custom types and apply it to `edges` and `pageInfo` fields along with the `Edge` type.