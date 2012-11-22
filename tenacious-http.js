/**
 * Node module to tenaciously maintain HTTP client connections for real-time streaming.
 * User: wadeforman
 * Date: 11/7/12
 * Time: 2:03 PM
 */


"use strict"
var Q = require('q');
var http = require('http');
var EventEmitter = require('events').EventEmitter;
var parseUrl = require('url').parse;

var __ = function(){

};

/**
 * creates an instance of tenaciousHttp
 * @param host -  end point to connect to
 * @param port - port of the end point to connect to
 * @param header - custom header
 * @param init - function which is called after the initial request or subsequent reconnect is made
 * @return {Object tenaciousHttp}
 */
__.create = function (host, port, header, init) {
    var instance = new __();
    if(host) {
        instance.host = host;
    } else {
        throw new Error('host is a required parameter');
    }

    if(port) {
        instance.port = port;
    } else {
        throw new Error('port is a require parameter');
    }

    instance.header = header;
    instance.reconnectAttempts = 0;
    instance.connectionState = 'disconnected';
    instance.init = init || function(){};
    instance.pendingStop = false;
    return instance;
};

__.prototype = Object.create(EventEmitter.prototype);
__.SOCKET_TIMEOUT = 60000;

/**
 * starts a tenaciousHttp connection
 * @return {Promise}
 */
__.prototype.start = function() {
    var options;
    var d = Q.defer();
    var errorMessage = '';
    var self = this;

    if(this.isWritable()) {
        //we already have a open connection
        return Q.resolve();
    }

    this.pendingStop = false;
    this.connectionState = 'connecting';

    options = parseUrl(this.host);
    options.port = this.port;
    options.method = 'GET';
    options.headers = this.header;

    this.request = http.request(options, function (response) {
        response.setEncoding('utf-8');
        if(response.statusCode !== 200) {
            response.on('data', function(chunk){
                errorMessage += chunk;
            });

            response.on('end', function() {
                d.reject('bad status code: ' + response.statusCode + '\n' + errorMessage);
            });
        } else {
            response.on('data', function(chunk){
                self.emit('data',chunk, response.statusCode);
            });

            response.on('end', function() {
                self.emit('end', response.statusCode);
                self.recover().then(
                    function(){
                        self.emit('recovered', 'server end');
                    });
            });
            self.connectionState = 'connected';
            d.resolve();
        }
    });

    //handle socket timeouts
    this.request.on('socket', function (socket) {
        socket.setTimeout(__.SOCKET_TIMEOUT);

        socket.on('timeout', function() {
            self.recover().then(
                function(){
                    self.emit('recovered', 'timeout');
                });
            socket.destroy();
        });

        socket.on('close', function (hasError) {
            if(hasError) {
                self.recover().then(
                    function(){
                        self.emit('recovered', 'connection closed with error');
                    });
                socket.destroy();
            }
        });
    });

    this.request.on('error', function(err) {
        d.reject(err);
    });
    this.init();
    return d.promise;
};

/**
 * stops the tenaciousHttp connection
 * @param message -  string message to send to the host with the end message
 * @return {Promise}
 */
__.prototype.stop = function(message) {
    this.pendingStop = true;
    if(this.isWritable()) {
        if(message) {
            this.request.end(message);
        } else {
            this.request.end();
        }
    } else {
        return Q.reject('no connection running to stop');
    }
    this.request = undefined;
    return Q.resolve();
};

/**
 * writes a message to the http connection buffer
 * @param content - string message to send to the host
 */
__.prototype.write = function(content) {
    if(this.isWritable()) {
        this.request.write(content);
    } else {
        //buffered writes?
    }
};

/**
 * will initiate a connection recovery.
 * will continuously attempt to reconnect to the host
 * with a growing back off (doubles starting at 10s) maxing at 320 seconds.
 * @return {Promise}
 */
__.prototype.recover = function() {
    var d = Q.defer();
    if(this.pendingStop){
        return Q.reject('will not recover when there is a pending stop');
    }
    if(this.reconnectAttempts > 0) {
        return Q.reject('already attempting to reconnect');
    }
    this.request = undefined;
    this.connectionState = 'reconnecting';
    this.reconnectAttempts = 0;
    this._reconnect(d);
    return d.promise;
};

/**
 * recursive connect method.
 * @param deferred Promise
 * @return {Promise}
 * @private
 */
__.prototype._reconnect = function(deferred) {
    var self = this;
    return Q.delay(this._calculateReconnectDelay()).then(
        function() {
            self.start().then(
                function() {
                    self.reconnectAttempts = 0;
                    deferred.resolve();
                }, function (err) {
                    self.connectionState = 'reconnecting';
                    return self._reconnect(deferred);
                }
            );
        }
    );
};
/**
 * calculates the required delay before attempting to reconnect (in ms)
 * @return {Number}
 * @private
 */
__.prototype._calculateReconnectDelay = function () {
    var delay = 0;
    if(this.reconnectAttempts == 0) {
        ++this.reconnectAttempts;
        return delay;
    }
    delay += 10000 * Math.pow(2, this.reconnectAttempts - 1);
    if(delay > 320000) {
        return 320000;
    }

    ++this.reconnectAttempts;
    return delay;
};

/**
 * returns if the tenaciousHttp is in a connected state.  i.e. the connection can be written to.
 * @return {Boolean}
 */
__.prototype.isWritable = function() {
    return (this.connectionState === 'connected' || this.connectionState === 'connecting');
};

module.exports = __;