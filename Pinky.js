(function () {

    var next = process.nextTick,
        states = {
            PENDING: 0,
            FULLFILLED: 1,
            REJECTED: -1
        };

    function executeFullfillCallbacks(callbacks, value) {
        var callback;
        while (callbacks.length) {
            callback = callbacks.pop();
            executeCallback(callback.onFullfilled, callback.promise, value);
        }

    }

    function executeRejectCallbacks(callbacks, value) {
        var callback;
        while (callbacks.length) {
            callback = callbacks.pop();
            executeCallback(callback.onRejected, callback.promise, value);
        }
    }

    function executeCallback(callback, promise, value) {
        var x;
        try {
            x = callback(value);
            if (x === undefined) {
                x = value;
            }
        } catch (e) {
            promise.reject(e);
        }
        Resolve(promise, x);
    }

    function Resolve(promise, x) {
        var then,
            called = false;
        if (promise === x) {
            promise.reject(TypeError('Promise cannot refer to itself'));
            return;
        }
        if (x instanceof Promise) {
            switch (x.state) {
            case states.FULLFILLED:
                promise.fullfill(x.value);
                break;
            case states.REJECTED:
                promise.reject(x.value);
                break;
            }
        } else {
            if (typeof x === 'function') {
                try {
                    then = x.then;
                    then.call(x, function (y) {
                        if (called) {
                            return;
                        }
                        called = true;
                        Resolve(promise, y);
                    }, function (r) {
                        if (called) {
                            return;
                        }
                        called = true;
                        promise.reject(r);
                    });
                } catch (e) {
                    promise.reject(e);
                }
            } else {
                promise.fullfill(x);
            }
        }
    }

    function Promise() {
        this.state = states.PENDING;
        this.callbacks = [];
    }

    Promise.prototype.then = function (onFullfilled, onRejected) {
        var value = this.value,
            promise2 = new Promise();
        switch (this.state) {
        case states.PENDING:
            this.callbacks.push({
                onFullfilled: onFullfilled,
                onRejected: onRejected,
                promise: promise2
            });
            break;
        case states.FULLFILLED:
            if (typeof onFullfilled === 'function') {
                next(function () {
                    executeCallback(onFullfilled, promise2, value);
                });
            } else {
                promise2.fullfill(value);
            }
            break;
        case states.REJECTED:
            if (typeof onRejected === 'function') {
                next(function () {
                    executeCallback(onRejected, promise2, value);
                });
            } else {
                promise2.reject(value);
            }
            break;
        }
        return promise2;
    };

    Promise.prototype.fullfill = function (value) {
        var callbacks = this.callbacks;
        if (this.state === states.PENDING) {
            this.state = states.FULLFILLED;
            this.value = value;
            if (this.callbacks.length >= 1) {
                next(function () {
                    executeFullfillCallbacks(callbacks, value);
                });
            }
        }
        return this;
    };

    Promise.prototype.reject = function (value) {
        var callbacks = this.callbacks;
        if (this.state === states.PENDING) {
            this.state = states.REJECTED;
            this.value = value;
            if (this.callbacks.length >= 1) {
                next(function () {
                    executeRejectCallbacks(callbacks, value);
                });
            }
        }
        return this;
    };

    Promise.prototype.when = function () {
        var args = [],
            values = [],
            pending = 0,
            i = arguments.length,
            self = this;

        while (--i !== -1) {
            if (arguments.hasOwnProperty(i)) {
                args.push(arguments[i]);
            }
        }

        if (args.length >= 1) {
            next(function x() {
                var element, value;
                if (args.length) {
                    element = args.pop();
                    if (typeof element === 'function') {
                        try {
                            value = element();
                            if(value instanceof Promise){
                                args.push(value);    
                            }
                        } catch (e) {
                            value = e;
                        }
                        values.push(value);
                    } else {
                        if (element instanceof Promise) {
                            switch (element.state) {
                            case states.FULLFILLED:
                                values.push(element.value);
                                break;
                            case states.REJECTED:
                                values.push(element.value);
                                self.reject(element.value);
                                break;
                            case states.PENDING:
                                element.then(function(value){
                                    values.push(value);
                                    --pending;
                                    if(!pending) {
                                        self.fullfill();    
                                    }
                                });
                                ++pending;
                                break;
                            }
                        } else {
                            values.push(element);
                        }
                    }
                    next(x);
                } else {
                    if (!pending) {
                        self.fullfill(values);
                    }
                }
            });
        } else {
            this.fullfill();
        }

        return this;
    };
    
    Promise.prototype.done = function(callback) {
        return this.then(callback);
    };

    module.exports = Promise;
})();

