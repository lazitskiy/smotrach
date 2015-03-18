/**
 * Created by vaso on 17.03.15.
 */

var os = require('os');
var path = require('path')

module.exports = function () {

    //if (process.__node_webkit == 1) {
    var gui = global.window.nwDispatcher.requireNwGui();
    //}

    var settings = {};

    settings.gui = gui;
    settings.dataPath = gui.App.dataPath;
    settings.appName = 'Smotrach';
    settings.tmpLocation = path.join(os.tmpDir(), 'Smotrach');
    settings.databaseLocation = path.join(settings.dataPath, 'data');

    /**
     * Api settings
     */
    settings.provider = 'sdf';

    return settings;
}