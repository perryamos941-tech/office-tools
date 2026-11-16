'use strict';

// GitHub Pages cannot send a site-specific frame-ancestors header.
if (window.top === window.self) document.documentElement.removeAttribute('hidden');
