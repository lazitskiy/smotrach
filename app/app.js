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
    base: {},
    lang: {}
});
app.addRegions({
    menu: '.menu',
    content: '.content'
});

// Minimum percentage to open video
app.MIN_PERCENTAGE_LOADED = 0.5;
// Minimum bytes loaded to open video
app.MIN_SIZE_LOADED = 10 * 1024 * 1024;


var nedb = require('nedb');
var q = require('Q');

require('./js/streamer')(app);

//lib
require('./js/http')(app, q);

app._ = _;
app.$ = $;
app.settings = settings();

require('./js/language')(app);
var i18n = app.i18n;

/**
 * App cocponents
 */
//Models
require('./js/models/baseModel')(app, q, Backbone, settings(), nedb);
require('./js/models/filmModel')(app, q);
require('./js/models/settingModel')(app, q);

//Views
require('./js/views/baseView')(app, q, Backbone, settings(), $);
require('./js/views/index/index')(app);
require('./js/views/film/detail')(app);


// Controllers
require('./js/controllers/baseController')(app);
require('./js/controllers/indexController')(app);
require('./js/controllers/filmController')(app);

//Router
require('./js/config/routers')(app, Marionette);


app.on('start', function () {

    var init_menu = function () {
        var defer = q.defer();
        var template = document.querySelector('#menu');

        $.get(template.src, function (res) {
            var parent = $(template).parent();
            parent.html(res);
            $(template).remove();
            return defer.resolve();
        });
        return defer.promise;
    }


    init_menu().then(function () {
        //  App.menu.empty();

        var width = parseInt(localStorage.width ? localStorage.width : Settings.defaultWidth);
        var height = parseInt(localStorage.height ? localStorage.height : Settings.defaultHeight);
        var x = parseInt(localStorage.posX ? localStorage.posX : -1);
        var y = parseInt(localStorage.posY ? localStorage.posY : -1);

        // reset app width when the width is bigger than the available width
        if (screen.availWidth < width) {
            win.info('Window too big, resetting width');
            width = screen.availWidth;
        }

        // reset app height when the width is bigger than the available height
        if (screen.availHeight < height) {
            win.info('Window too big, resetting height');
            height = screen.availHeight;
        }

        // reset x when the screen width is smaller than the window x-position + the window width
        if (x < 0 || (x + width) > screen.width) {
            win.info('Window out of view, recentering x-pos');
            x = Math.round((screen.availWidth - width) / 2);
        }

        // reset y when the screen height is smaller than the window y-position + the window height
        if (y < 0 || (y + height) > screen.height) {
            win.info('Window out of view, recentering y-pos');
            y = Math.round((screen.availHeight - height) / 2);
        }

        win.zoomLevel = zoom;
        win.resizeTo(width, height);
        win.moveTo(x, y);

    });

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
    fs.appendFileSync(path.join(settings().dataPath, 'logs.txt'), '\n\n' + arguments[0]); // log errors;
};


var deleteFolder = function (path) {

    if (typeof path !== 'string') {
        return;
    }

    try {
        var files = [];
        if (fs.existsSync(path)) {
            files = fs.readdirSync(path);
            files.forEach(function (file, index) {
                var curPath = path + '\/' + file;
                if (fs.lstatSync(curPath).isDirectory()) {
                    deleteFolder(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    } catch (err) {
        win.error('deleteFolder()', err);
    }
};


win.on('resize', function (width, height) {
    localStorage.width = Math.round(width);
    localStorage.height = Math.round(height);

});

win.on('move', function (x, y) {
    localStorage.posX = Math.round(x);
    localStorage.posY = Math.round(y);
});
win.on('close', function () {
    // deleteFolder(app.settings.tmpLocation);
    win.close(true);
});

// Show 404 page on uncaughtException
process.on('uncaughtException', function (err) {
    win.error(err, err.stack);
});