import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import ErrorBoundary from "./components/base/ErrorBoundary";
import CookieConsentBanner from "./components/feature/CookieConsentBanner";
import { installGlobalErrorLogging } from "./lib/errorLog";

installGlobalErrorLogging();

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <BrowserRouter basename={__BASE_PATH__}>
          <AppRoutes />
          <CookieConsentBanner />
        </BrowserRouter>
      </ErrorBoundary>
    </I18nextProvider>
  );
}

export default App;
