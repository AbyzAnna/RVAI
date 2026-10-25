// Rebuild page: the full-page Rebuild flow. ?app=Name starts research straight away.
import { mountRebuild } from './rebuild-flow.js';

mountRebuild(document.getElementById('rebuild-root'), { app: new URLSearchParams(location.search).get('app') || '' });
