/**
 * Copyright (c) 2012 LocalResponse Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 *
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
 * OR OTHER DEALINGS IN THE SOFTWARE.
 * User: wadeforman
 * Date: 11/7/12
 * Time: 2:01 PM
 */

"use strict"

var Tenacious = require('../../tenacious-http');
var http = require('http');
var Q = require('q');

exports['create'] = {
    'success' : function(test) {
        var headers = {test:'123'};
        var opts = {
            host: 'test host',
            headers: headers,
            auth: this.username + ':' + this.apiKey
        };
        var p = Tenacious.create(opts, function(client) {
            client.write('\n');
        });
        test.deepEqual(p.opts,opts);
        test.done();
    }
}

exports['start'] = {
    setUp : function(cb) {
        var headers = {
            'User-Agent'        : 'agent',
            'Host'              : 'localhost',
            'Connection'        : 'Keep-Alive',
            'Transfer-Encoding' : 'chunked',
            'Authorization'     : 'abc123:123'
        };
        this.opts = {
            host: 'localhost',
            port : 1333,
            headers: headers,
            auth: 'abc123:123'
        };
        cb();
    },

    tearDown : function(cb) {
        Tenacious.SOCKET_TIMEOUT = 60000;
        cb();
    },

    'success' : function(test) {

        var t = Tenacious.create(this.opts, function(client) {
            client.write('written value1');
        });

        t.recover = function () {
            test.ok(true);
            return Q.resolve();
        };

        t.on('data', function(chunk, statusCode){
            test.equal(chunk, 'response');
            test.equal(statusCode, 200);
        });

        t.on('recovered', function(mess) {
            test.equal(mess, 'server end');
            test.done();
        });

        t.on('end', function(statusCode){
            test.equal(statusCode, 200);
        });

        test.expect(8);

        var server = http.createServer(function (req, res) {
            req.setEncoding('utf-8');
            req.on('data', function(chunk) {
                test.equal(chunk, 'written value1');
                res.write('response');
                res.end();
            });
        }).listen(1333, '127.0.0.1', null, function() {
                t.start().then(
                    function(r) {
                        test.equal(t.connectionState, 'connected');
                        test.ok(true);
                        server.close();
                    }, function (err) {
                        server.close();
                        test.done();
                    }
                ).done();
            });
    },

    'handles non-200 status codes' : function(test) {
        test.expect(2);

        var t = Tenacious.create(this.opts);
        var server = http.createServer(function (req, res) {
            req.setEncoding('utf-8');
            req.on('data', function(chunk) {
                test.equal(chunk, 'written value1');
                res.writeHead(401);
                res.write('this is not found');
                res.end();
            });
        }).listen(1333, '127.0.0.1', null, function(){
                t.start().then( //connects to the remote server.  returns a promise
                    function(r) {
                        server.close();
                        test.ok(false);
                        test.done();
                    }, function (err) {
                        server.close();
                        test.ok(true);
                        test.done();
                    }
                ).done();

                t.write('written value1');
            });
    },

    'will reject on socket timeout and recover' : function (test) {

        var t = Tenacious.create(this.opts);
        Tenacious.SOCKET_TIMEOUT = 1;
        test.expect(3);

        t.recover = function (){
            test.ok(true);
            return Q.resolve();
        };

        t.on('recovered', function(message){
            test.equal(message, 'timeout');
        });

        t.start().then(
            function () {
                test.ok(false);
                test.done();
            }, function (err) {
                test.ok(true);
                test.done();
            }).done();
    },

    'will emit a recovered event on socket timeout' : function (test) {

        Tenacious.SOCKET_TIMEOUT = 100;

        var t = Tenacious.create(this.opts);

        t.recover = function (){
            return Q.resolve();
        };

        t.on('recovered', function(message){
            test.equal(message,'timeout');
            server.close();
            test.done();
        });

        var server = http.createServer(function (req, res) {
            req.setEncoding('utf-8');
            req.on('data', function(chunk) {
                test.equal(chunk, 'written value1');
                res.write('this is not found');
            });
        }).listen(1333, '127.0.0.1', null, function() {
                t.start().then(
                    function(r) {
                        test.ok(true);
                    }, function(err) {
                        test.ok(false);
                        server.close();
                        test.done();
                    }
                ).done();
                t.write('written value1');
            });

    },

    'rejects when end point refuses the connection' : function (test) {
        test.expect(3);

        var t = Tenacious.create(this.opts);
        t.recover = function (){
            test.ok(true);
            return Q.resolve();
        };

        t.on('recovered', function(mess){
            test.equal(mess, 'connection closed with error');
            test.done();
        });

        t.start().then(function(){
            test.ok(false);
            test.done();
        }, function (err)  {
            test.ok(true);
        }).done();
    },

    'will resolve if there is already a request' : function(test) {
        var t = Tenacious.create('http://localhost/',1333, this.headers);

        t.isWritable = function() {
            return true;
        };

        test.expect(1);

        t.start().then(
            function() {
                test.ok(true);
                test.done();
            }
        ).done();
    }
}

exports['stop'] = {
    'success' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        t.connectionState = 'connected';
        t.request = {};
        t.request.end = function(contents) {
            test.ok(true);
        };

        t.request.removeAllListeners = function() {
            test.ok(true);
        };

        test.expect(3);
        t.stop().then(
            function() {
                test.ok(true);
                test.done();
            }, function(err){
                test.ok(false);
                test.done();
            }
        ).done();
    },
    'still end connection with message' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        t.request = {};
        t.connectionState = 'connected';
        t.request.end = function(contents) {
            test.equal(contents, 'ending message');
        };

        t.request.removeAllListeners = function() {
            test.ok(true);
        };

        test.expect(3);
        t.stop('ending message').then(
            function() {
                test.ok(true);
                test.done();
            }, function(err){
                test.ok(false);
                test.done();
            }
        ).done();
    }
}

exports['write'] = {
    'success' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        t.request = {};
        t.isWritable = function(){
            return true;
        };
        t.request.write = function(contents) {
            test.equal(contents, 'test');
        };
        test.expect(1);
        t.write('test');
        test.done();
    }
}

exports['reconnect'] = {
    'success' : function(test){
        var t = Tenacious.create('http://127.0.0.1/',1333);
        t._calculateReconnectDelay = function() {
            test.ok(true);
            return 0;
        };

        t.start = function () {
            test.ok(true);
            return Q.resolve({});
        };

        test.expect(3);

        t._reconnect().then(
            function(r){
                test.ok(true);
                test.done();
            }, function(err) {
                test.ok(false);
                test.done();
            }
        ).done();
    }
}

exports['recover'] = {
    'success' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);

        t._reconnect = function(d) {
            return d.resolve({});
        };

        t.recover().then(
            function(r){
                test.done();
            }, function(err) {
                test.ok(false);
                test.done();
            }
        ).done();
    },

    'will attempt to recover again if it fails to reconnect' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        test.expect(10);
        t.start = function () {
            test.ok(true);
            return Q.reject();
        };

        t._calculateReconnectDelay = function () {
            test.ok(true);
            ++t.reconnectAttempts;
            if(t.reconnectAttempts >= 5) {
                t.start = function() {
                    test.ok(true);
                    return Q.resolve({});
                };
            }

            return 0;
        };

        t.recover().then(
            function(r) {
                test.done();
            }, function(err) {
                test.ok(false);
                test.done();
            }
        ).done();
    },

    'will reject if already attempting to reconnect' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        t.reconnectAttempts = 1;
        test.expect(1);

        t.recover().then(
            function() {
                test.ok(false);
                test.done();
            }, function(err) {
                test.ok(true);
                test.done();
            }
        ).done();
    },

    'will reject if there is a pending stop' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        t.pendingStop = true;

        t.recover().then(
            function(){
                test.ok(false);
                test.done();
            }, function(err) {
                test.ok(true);
                test.done();
            }
        ).done();
    }
}

exports['calculateReconnectionDelay'] = {
    'will calculate reconnect timer' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);

        test.equal(t._calculateReconnectDelay(), 0);
        test.equal(t.reconnectAttempts, 1);

        test.equal(t._calculateReconnectDelay(), 10000);
        test.equal(t.reconnectAttempts, 2);

        t.reconnectAttempts = 3
        test.equal(t._calculateReconnectDelay(), 40000);

        t.reconnectAttempts = 1000;
        test.equal(t._calculateReconnectDelay(), 320000);

        test.done();
    }
}

exports['isStarted'] = {
    'returns true if start has already resolved' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        test.equal(t.isWritable(), false);
        test.done();
    },

    'return false if start has not already been called' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        t.connectionState = 'connected';
        t.request = {};
        test.equal(t.isWritable(), true);
        test.done();
    },

    'returns false when there is a undefined request ' : function(test) {
        var t = Tenacious.create('http://127.0.0.1/',1333);
        t.connectionState = 'connected';
        test.equal(t.isWritable(), false);
        test.done();
    }
}
