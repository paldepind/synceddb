Authentication example
----------------------

This contrieved example shows how to extend the protocol between a SyncedDB
client and a SyncedDB server. This is used to implement server side
authentication.

In this specific implementation the authentiation works in the following steps:

1. The client gets hold of a token. This token chould be achieved through a
   OAuth provider completely seperate from the SyncedDB server. In this example
   the tokens are crudely hardcoded.
2. The SyncedDB client connects to the SyncedDB server. Upon connection a
   custom server side handler registers a callback to be called in 5 seconds.
3. When the connection is established the client sends its token to the server
   in a custom message.
4. The server validates the token and sends the result to the client.
5. When the client recieves a authentication response indicating success it
   initiates the synchronization.

Furthermore the server uses custom message handlers that performs authorization
and prevents access if the client doesn't have priviledges. 
