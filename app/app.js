/**
 * Created by vaso on 15.03.15.
 */
fs = require('fs');
path = require('path');

Settings = require('./js/Settings');

win = Settings().gui.Window.get();
win.log = console.log.bind(console);

win.debug = function () {
    var params = Array.prototype.slice.call(arguments, 1);
    params.unshift('%c[%cDEBUG%c] %c' + arguments[0], 'color: black;', 'color: green;', 'color: black;', 'color: blue;');
    console.debug.apply(console, params);
};

win.info = function () {
    var params = Array.prototype.slice.call(arguments, 1);
    params.unshift('[%cINFO%c] ' + arguments[0], 'color: blue;', 'color: black;');
    console.info.apply(console, params);
};
win.warn = function () {
    var params = Array.prototype.slice.call(arguments, 1);
    params.unshift('[%cWARNING%c] ' + arguments[0], 'color: orange;', 'color: black;');
    console.warn.apply(console, params);
};
win.error = function () {
    var params = Array.prototype.slice.call(arguments, 1);
    params.unshift('%c[%cERROR%c] ' + arguments[0], 'color: black;', 'color: red;', 'color: black;');
    console.error.apply(console, params);
    fs.appendFileSync(path.join(Settings().dataPath, 'logs.txt'), '\n\n' + arguments[0]); // log errors;
};

$ = require('jquery');
_ = require('backbone.marionette/node_modules/underscore');
Backbone = require('backbone.marionette/node_modules/backbone');
Backbone.$ = $;
Marionette = require('backbone.marionette');


App = new Marionette.Application();
_.extend(App, {
    Models: {},
    Controllers: {},
    Collections: {},
    Views: {},
    Config: {},
    Base: {}
});
App.addRegions({
    menu: '.menu',
    content: '.content'
});

Nedb = require('nedb');
Q = require('Q');
require('./js/models/BaseModel')(App, Backbone, Nedb, Q, Settings());
require('./js/models/FilmModel')(App);


App.on('start', function () {
    Backbone.history.start();

});

