/**
 * Created by vaso on 04.03.15.
 */
var i18n = require('i18n');

module.exports = function (app) {
    app.lang.detectLocale = function () {

        var fs = require('fs');
        // The full OS language (with localization, like 'en-uk')
        var pureLanguage = global.window.navigator.language.toLowerCase();
        // The global language name (without localization, like 'en')
        var baseLanguage = global.window.navigator.language.toLowerCase().slice(0, 2);

        if (app.$.inArray(pureLanguage, app.lang.allTranslations) !== -1) {
            return pureLanguage;
        } else if ($.inArray(baseLanguage, app.lang.allTranslations) !== -1) {
            return baseLanguage;
        } else {
            return 'en';
        }
    };

    app.lang.allTranslations = ['en', 'ru'];
    app.lang.langcodes = {
        'ru': {
            name: 'Russian',
            nativeName: 'русский язык',
            subtitle: true,
            encoding: ['Windows-1251'] // Tested
        },
        'en': {
            name: 'English',
            nativeName: 'English',
            subtitle: true,
            encoding: ['iso-8859-1'] // Tested
        }
    }

    i18n.configure({
        defaultLocale: app.lang.detectLocale(),
        locales: app.lang.allTranslations,
        directory: __dirname + '/language'
    });

    app.i18n = i18n;
    return app;
}