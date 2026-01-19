window.consentManagerConfig = {
  language: 'de',

  guiOptions: {
    consentModal: {
      layout: 'bar',
      position: 'bottom',
      equalWeightButtons: true
    }
  },

  categories: {
    necessary: {
      enabled: true,
      readOnly: true
    },
    analytics: {
      enabled: false
    }
  },

  services: {
    ga4: {
      category: 'analytics',
      type: 'script',
      src: 'https://www.googletagmanager.com/gtag/js?id=G-520294707',
      async: true
    }
  },

  onConsent: function(consent) {
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}

    gtag('consent', 'update', {
      analytics_storage: consent.analytics ? 'granted' : 'denied'
    });

    if (consent.analytics) {
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXX', {
        anonymize_ip: true
      });
    }
  },

  languages: {
    de: {
      consentModal: {
        title: 'Cookies & Datenschutz',
        description:
          'Wir verwenden Cookies, um die Website zu analysieren und zu verbessern.',
        acceptAllBtn: 'Alle akzeptieren',
        acceptNecessaryBtn: 'Nur notwendige',
        showPreferencesBtn: 'Einstellungen'
      }
    }
  }
};
