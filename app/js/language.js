/**
 * Created by vaso on 04.03.15.
 */

App.Localization.detectLocale = function () {

    var fs = require('fs');
    // The full OS language (with localization, like 'en-uk')
    var pureLanguage = navigator.language.toLowerCase();
    // The global language name (without localization, like 'en')
    var baseLanguage = navigator.language.toLowerCase().slice(0, 2);

    if ($.inArray(pureLanguage, App.Localization.allTranslations) !== -1) {
        return pureLanguage;
    } else if ($.inArray(baseLanguage, App.Localization.allTranslations) !== -1) {
        return baseLanguage;
    } else {
        return 'en';
    }
};

App.Localization.allTranslations = ['en', 'ru'];

i18n.configure({
    defaultLocale: App.Localization.detectLocale(),
    locales: App.Localization.allTranslations,
    directory: '../../language'
});

info('Locale is '+App.Localization.detectLocale());
