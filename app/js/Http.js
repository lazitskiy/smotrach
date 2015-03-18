/**
 * Created by vas on 17.03.2015.
 */
var http = require('http');

module.exports = function (app, q) {
    'use strict';
    var httpRequest = {

        request: function (url) {
            var self = this;
            var deferred = q.defer();
            self.httpGet(url)
                .then(function (res) {
                    return self.loadBody(res);
                })
                .then(function (body) {
                    deferred.resolve(body);
                })
                .fail(function (error) {
                    console.log("error occured: " + error);
                });

            return deferred.promise;
        },

        httpGet: function (options) {
            var deferred = q.defer();
            http.get(options, deferred.resolve);
            return deferred.promise;
        },

        loadBody: function (res) {
            var deferred = q.defer();
            var body = "";
            res.on("data", function (chunk) {
                body += chunk;
            });
            res.on("end", function () {
                deferred.resolve(body);
            });
            return deferred.promise;
        }
    }
    app.httpRequest = httpRequest;
    return app;
}