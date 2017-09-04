import { Injectable } from '@angular/core';
import { Subject } from 'rxjs/Subject';

@Injectable()
export class MimeViewerIntl {
  changes: Subject<void> = new Subject<void>();

  close = 'Close';
  attribution = 'Attribution';
  contents = 'Contents';
  metadata = 'Metadata';
  license = 'License';
  footerTestString = `I'm a footer`;
  zoomIn = 'Zoom in';
  zoomOut = 'Zoom out';
  previousPage = 'Previous Page';
  nextPage = 'Next Page';
  home = 'Go Home';
}
