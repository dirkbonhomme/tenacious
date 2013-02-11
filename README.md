#TenaciousHttp

This library creates a streaming node Http connection which will automatically attempt recover from disconnect events.

Note that this module is promise based (via the Q library) and event based (via the EventEmitter)

##Prerequisites
- node

##Install
- npm install tenacious-http
- `require('tenacious-http');`

##Use
###create(options)
    //create a tenaciousHttp instance via the static factory
    var options = {
            host: 'streaming.api.com',
            headers: headers,
            auth: username + ':' + apiKey,
            path: '/'
        };
    var tenacious = Tenacious.create(options, [init function]);
###SOCKET_TIMEOUT
SOCKET_TIMEOUT is a static variable.
If there is no activity between the http connection and the client for SOCKET_TIME (in ms),
then the connection is closed and 'recover()' is called.
If you want there to be no timeout then set SOCKET_TIMEOUT to 0.
The SOCKET_TIMEOUT defaults to 60 seconds.
A timeout event will be emitted when a timeout occurs.

    Tenacious.SOCKET_TIMEOUT = 30000; //changes the timeout to 30 seconds.
    Tenacious.SOCKET_TIMEOUT = 0; //sets the socket to never timeout
###start()
Starts an http connection, returning a promise.

    tenacious.start().then(
        function() {
            //successfully started
        } , function(err) {
            //start had error 'err'
        });
###stop(message [optional])
Stops the streaming http connection, returning a promise.

    tenacious.stop().then(
        function() {
            //stopped successfully
        }, function (err) {
            //stop had error 'err'
        });

###write(message)
Writes a messages to the host.

    tenacious.write('message to write to the host');
###recover()
Attempts to reconnect the host, returning a promise.
call this when the for application level error cases.

    tenacious.recover.then(
        function() {
            //successfully recovered/reconnected
        }, function(err) {
            //failed to recover
        });
###isWritable()
Returns true if the state of the http connection is writable.
    if(tenacious.isWritable()){
        //tenacious.write('foo');  will work
    }

##events emitted

###data(chunk, statusCode)
Emits the data coming in to the Http connection, with its status code.

###end(statusCode)
Emits an end once the host sends an end to the http client, with its status code.
Note that tenaciousHttp calls 'recover()' once it receives an end from the host.

###timeout
Emits when there was no data transferred over the underlying socket for the http connection
over the specific timeout period (defaults to 60 seconds).
Note that tenaciousHttp calls 'recover()' whenever a socket timeout occurs.

###recovered(reason [optional])
Emits after the recover call is successful.
The consumer should do any post connection work on this event.


