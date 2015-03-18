/**
 * Created by vaso on 15.03.15.
 */
var fs = require('fs');
var path = require('path');
var settings = require('./js/settings');


var app = new Backbone.Marionette.Application();
_.extend(app, {
    models: {},
    controllers: {},
    collections: {},
    views: {},
    config: {},
    base: {}
});
app.addRegions({
    menu: '.menu',
    content: '.content'
});


var nedb = require('nedb');
var q = require('Q');

//lib
require('./js/http')(app, q);

/**
 * App cocponents
 */
//Models
require('./js/models/baseModel')(app, q, settings(), Backbone, nedb);
require('./js/models/filmModel')(app, q);

// Controllers
require('./js/controllers/baseController')(app);
require('./js/controllers/indexController')(app);
require('./js/controllers/filmController')(app);

//Router
require('./js/config/routers')(app, Marionette);

//Views
//require('./js/views/film/filmView')(app);
//require('./js/views/film/filmCollection')(app);


app.on('start', function () {
    Backbone.history.start();
});


win = settings().gui.Window.get();
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
