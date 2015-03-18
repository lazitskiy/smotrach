/**
 * Created by vaso on 17.03.15.
 */

var os = require('os');
var path = require('path')

module.exports = function () {

    //if (process.__node_webkit == 1) {
    var gui = global.window.nwDispatcher.requireNwGui();
    //}

    var Settings = {};

    Settings.gui = gui;
    Settings.dataPath = gui.App.dataPath;
    Settings.appName = 'Smotrach';
    Settings.tmpLocation = path.join(os.tmpDir(), 'Smotrach');
    Settings.databaseLocation = path.join(Settings.dataPath, 'data');

    return Settings;
}