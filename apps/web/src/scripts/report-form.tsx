import { createRoot } from 'react-dom/client';
import type { Locale } from '@pharmacy-skg/core';
import ReportForm from '../components/ReportForm.tsx';
import type { Dictionary } from '../i18n/index.ts';

const root = document.getElementById('report-form');
if (root !== null) {
  const locale: Locale = root.dataset.locale === 'en' ? 'en' : 'el';
  const labels = JSON.parse(root.dataset.labels ?? '{}') as Dictionary['report']['form'];
  createRoot(root).render(<ReportForm labels={labels} locale={locale} />);
}
