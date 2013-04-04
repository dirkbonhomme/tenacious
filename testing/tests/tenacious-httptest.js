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

"use strict";

var Tenacious = require('../../tenacious-http');
var MonkeyPatcher = require('monkey-patcher').MonkeyPatcher;
var https = require('https');
var Q = require('q');
var EventEmitter = require('events').EventEmitter;

exports['create'] = {

    setUp: function(cb) {
        MonkeyPatcher.setUp(cb);
    },

    tearDown: function(cb) {
        MonkeyPatcher.tearDown(cb);
    },

    'with URL' : function(test) {

        test.expect(2);

        var req = new EventEmitter();
        var url = 'https://streaming.example.com/subscribe';

        MonkeyPatcher.patch(https, 'request', function (options) {

            test.equal(options, url);
            return req;
        });

        var p = Tenacious.create(url);

        p.initRequest();
        test.ok(p instanceof Tenacious);
        test.done();
    },

    "with options": function (test) {

        test.expect(2);

        var req = new EventEmitter();

        var headers = {test:'123'};
        var opts = {};

        MonkeyPatcher.patch(https, 'request', function (options) {

            test.deepEqual(options, opts);
            return req;
        });

        var p = Tenacious.create(opts);

        p.initRequest();
        test.ok(p instanceof Tenacious);
        test.done();
    },

    "with callback": function (test) {

        test.expect(2);

        var req = new EventEmitter();

        var init = function () {
        };

        MonkeyPatcher.patch(https, 'request', function (options) {

            test.deepEqual(options, opts);
            return req;
        });

        var p = Tenacious.create(init);

        test.equal(p.initRequest, init);
        test.ok(p instanceof Tenacious);

        test.done();
    }
};

exports['start'] = {

    setUp : function(cb) {

        MonkeyPatcher.setUp();

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

        MonkeyPatcher.tearDown();

        Tenacious.SOCKET_TIMEOUT = 60000;
        cb();
    },

    "rejects on bad callback": function (test) {

        var t = Tenacious.create(function(client) {
            throw new Error("oh no!");
        });

        t.start().fail(
            function () {
                test.done();
            }
        );
    },

    'success returns same promise' : function(test) {

        test.expect(9);

        var req = new EventEmitter();
        var res = new EventEmitter();
        var self = this;

        res.statusCode = 200;

        res.setEncoding = function (enc) {
            test.equal(enc, 'utf8');
        };

        MonkeyPatcher.patch(https, 'request', function (options) {

            test.equal(options, self.opts);

            return req;
        });

        var t = Tenacious.create(this.opts);

        // mock recovery because we'll end the mock response
        t.recover = function () {
            test.ok(true);
            return Q.resolve();
        };

        t.on('data', function (chunk, statusCode) {
            test.equal(chunk, 'response');
            test.equal(statusCode, 200);
        });

        t.on('end', function (statusCode) {
            test.equal(statusCode, 200);
        });

        t.on('recovered', function (reason) {
            test.equal(reason, 'server end');
            test.done();
        });

        var startPromise = t.start();

        startPromise.then(
            function () {
                test.equal(t.connectionState, 'connected');
                res.emit('data', 'response');
                res.emit('end');
            }
        ).done();

        // make sure it returns the exact same promise!
        test.equal(t.start(), startPromise);

        req.emit('response', res);
    },

    'rejects on non-200 status codes' : function(test) {

        test.expect(3);

        var req = new EventEmitter();
        var res = new EventEmitter();
        var self = this;

        res.statusCode = 401;

        res.setEncoding = function (enc) {
            test.equal(enc, 'utf8');
        };

        MonkeyPatcher.patch(https, 'request', function (options) {

            test.equal(options, self.opts);

            return req;
        });

        var t = Tenacious.create(this.opts);

        t.start().fail(
            function (reason) {
                test.equal(reason, 'bad status code: 401\nthere was an error!');
                test.done();
            }
        );

        req.emit('response', res);
        res.emit('data', 'there was an error!');
        res.emit('end');
    },

    'will reject on socket timeout and recover' : function (test) {

        test.expect(3);

        var req = new EventEmitter();
        var self = this;

        MonkeyPatcher.patch(https, 'request', function (options) {
            test.equal(options, self.opts);
            return req;
        });

        var t = Tenacious.create(this.opts);

        t.recover = function () {
            test.ok(true);
            return Q.resolve();
        };

        t.on('recovered', function (mess) {
            test.equal(mess, 'timeout');
            test.done();
        });

        t.start().fail(
            function (err)  {
                test.done();
            });

        var socket = new EventEmitter();

        socket.setTimeout = function () {};
        socket.destroy = function () {};

        req.emit('socket', socket);
        socket.emit('timeout');
    },

    'rejects when end point refuses the connection' : function (test) {

        test.expect(3);

        var req = new EventEmitter();
        var self = this;

        MonkeyPatcher.patch(https, 'request', function (options) {
            test.equal(options, self.opts);
            return req;
        });

        var t = Tenacious.create(this.opts);

        t.recover = function () {
            test.ok(true);
            return Q.resolve();
        };

        t.on('recovered', function (mess) {
            test.equal(mess, 'connection closed with error');
            test.done();
        });

        t.start().fail(
            function (err)  {
                test.done();
            });

        var socket = new EventEmitter();

        socket.setTimeout = function () {};
        socket.destroy = function () {};

        req.emit('socket', socket);
        socket.emit('close', true);
    },

    'rejects on request error' : function (test) {

        test.expect(1);

        var req = new EventEmitter();
        var self = this;

        MonkeyPatcher.patch(https, 'request', function (options) {
            test.equal(options, self.opts);
            return req;
        });

        var t = Tenacious.create(this.opts);

        t.start().fail(
            function (err)  {
                test.done();
            });

        req.emit('error', new Error());
    },

    'emits error of a failure to recover' : function(test) {

        test.expect(9);

        var req = new EventEmitter();
        var res = new EventEmitter();
        var self = this;

        res.statusCode = 200;

        res.setEncoding = function (enc) {
            test.equal(enc, 'utf8');
        };

        MonkeyPatcher.patch(https, 'request', function (options) {

            test.equal(options, self.opts);

            return req;
        });

        var t = Tenacious.create(this.opts);

        // mock recovery because we'll end the mock response
        t.recover = function () {
            test.ok(true);
            return Q.reject();
        };

        t.on('data', function (chunk, statusCode) {
            test.equal(chunk, 'response');
            test.equal(statusCode, 200);
        });

        t.on('end', function (statusCode) {
            test.equal(statusCode, 200);
        });

        t.on('error', function(message) {
            test.ok(true);
            test.done();
        });

        var startPromise = t.start();

        startPromise.then(
            function () {
                test.equal(t.connectionState, 'connected');
                res.emit('data', 'response');
                res.emit('end');
            }
        ).done();

        // make sure it returns the exact same promise!
        test.equal(t.start(), startPromise);

        req.emit('response', res);
    }
};

exports['stop'] = {

    'success' : function(test) {

        test.expect(2);

        var t = Tenacious.create('https://127.0.0.1/',1333);
        t.connectionState = 'connected';
        t.request = {};
        t.request.end = function(contents) {
            test.ok(true);
        };

        t.request.removeAllListeners = function() {
            test.ok(true);
        };

        t.stop().then(
            function() {
                test.done();
            }
        ).done();
    },

    'stop then start again' : function(test) {

        test.expect(4);

        var t = Tenacious.create('https://127.0.0.1/',1333);
        var req = new EventEmitter();
        var res = new EventEmitter();
        var initReqCalled = false;

        req.end = function(contents) {
            test.ok(true);
        };

        req.removeAllListeners = function() {
            test.ok(true);
        };

        res.statusCode = 200;
        res.setEncoding = function () {};

        t.initRequest = function () {

            initReqCalled = true;
            return req;
        };

        t.start().then(
            function () {
                test.ok(initReqCalled);
                return t.stop();
            }
        ).then(
            function () {

                initReqCalled = false;

                var p = t.start();

                req.emit('response', res);

                return p;
            }
        ).then(
            function () {
                test.ok(initReqCalled);
                test.done();
            }
        ).done();

        req.emit('response', res);
    },

    'still end connection with message' : function(test) {
        test.expect(2);

        var t = Tenacious.create('https://127.0.0.1/',1333);
        t.request = {};
        t.connectionState = 'connected';
        t.request.end = function(contents) {
            test.equal(contents, 'ending message');
        };

        t.request.removeAllListeners = function() {
            test.ok(true);
        };

        t.stop('ending message').then(
            function() {
                test.done();
            }
        ).done();
    }
};

exports['write'] = {

    'success' : function(test) {
        var t = Tenacious.create('https://127.0.0.1/',1333);
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
};

exports['reconnect'] = {

    'success' : function(test){
        var t = Tenacious.create('https://127.0.0.1/',1333);
        t._calculateReconnectDelay = function() {
            test.ok(true);
            return 0;
        };

        t.start = function () {
            test.ok(true);
            return Q.resolve({});
        };

        test.expect(3);

        var d = Q.defer();

        t._reconnect(d).then(
            function(r){
                test.ok(true);
                test.done();
            }
        ).done();
    }
};

exports['started'] = {

    setUp : function(cb) {

        MonkeyPatcher.setUp();

        var headers = {
            'User-Agent'        : 'agent',
            'Host'              : 'localhost',
            'Connection'        : 'Keep-Alive',
            'Transfer-Encoding' : 'chunked',
            'Authorization'     : 'abc123:123'
        };

        cb();
    },

    tearDown : function(cb) {
        MonkeyPatcher.tearDown(cb);
    },

    'success': function (test) {

        var req = new EventEmitter();
        var res = new EventEmitter();

        req.end = function () {};
        req.removeAllListeners = function () {};

        res.statusCode = 200;

        res.setEncoding = function (enc) {
            test.equal(enc, 'utf8');
        };

        MonkeyPatcher.patch(https, 'request', function (options) {
            return req;
        });

        var t = Tenacious.create('https://127.0.0.1/', 1333);

        t.start().then(
            function () {
                test.ok(t.started());

                return t.stop();
            }
        ).then(
            function () {
                test.equal(t.started(), false);

                test.done();
            }
        ).done();

        req.emit('response', res);
    }
};

exports['recover'] = {

    setUp : function(cb) {
        MonkeyPatcher.setUp(cb);
    },

    tearDown : function(cb) {
        MonkeyPatcher.tearDown(cb);
    },

    'success' : function(test) {

        test.expect(6);

        var req = new EventEmitter();
        var res = new EventEmitter();
        var reqCalled = false;

        req.end = function () {};
        req.removeAllListeners = function () {};

        res.statusCode = 200;

        res.setEncoding = function (enc) {
            test.equal(enc, 'utf8');
        };

        MonkeyPatcher.patch(https, 'request', function (options) {
            reqCalled = true;
            return req;
        });

        var t = Tenacious.create('https://127.0.0.1/',1333);

        t._calculateReconnectDelay = function () {
            return 0;
        };

        test.equal(reqCalled, false);

        t.start().then(
            function () {
                test.equal(reqCalled, true);
                reqCalled = false;
                var p = t.recover();
                setTimeout(function () {
                    req.emit('response', res);
                }, 10);
                return p;
            }
        ).then(
            function () {
                test.equal(reqCalled, true);
                test.done();
            }
        ).done();

        req.emit('response', res);
    },

    'will attempt to recover again if it fails to reconnect' : function(test) {

        var t = Tenacious.create('https://127.0.0.1/',1333);

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
            }
        ).done();
    },

    'will reject if already attempting to reconnect' : function(test) {

        var t = Tenacious.create('https://127.0.0.1/',1333);
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
        var t = Tenacious.create('https://127.0.0.1/',1333);
        t.pendingStop = true;

        t.recover().fail(
            function(){
                test.done();
            }
        ).done();
    }
};

exports['calculateReconnectionDelay'] = {
    'will calculate reconnect timer' : function(test) {
        var t = Tenacious.create('https://127.0.0.1/',1333);

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
};