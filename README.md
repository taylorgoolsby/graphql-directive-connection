# graphql-directive-connection

This package generates relay connections by marking fields with a `@connection` directive, and then passing your SDL through `applyConnectionTransform`.

## Example

Take a look at [./example.js](example.js).
You can run it using `npx babel-node example.js`.

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