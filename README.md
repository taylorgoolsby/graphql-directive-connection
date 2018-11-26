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
