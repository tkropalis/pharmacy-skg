/*
 * Runs synchronously in <head> of the two home addresses (layouts/Base.astro), before the first
 * paint, so there is no flash of the other language. If the person chose a language with the
 * language switch (scripts/boot.ts remembers the choice on the device), the Greek home opens in
 * English for someone who chose English. Nothing else is redirected: a shared link, a search
 * result or a bookmark of any other page opens as it is, and the browser's own language is never
 * used to move anyone (a Greek with an English phone, and search engines, would be moved wrongly).
 * The query and the hash are kept ("/?show=duty" becomes "/en/?show=duty").
 */
(function () {
  var choice;
  try {
    choice = localStorage.getItem('pharmacy-skg:lang');
  } catch {
    return;
  }
  if (choice === 'en' && location.pathname === '/') {
    location.replace('/en/' + location.search + location.hash);
  }
})();
