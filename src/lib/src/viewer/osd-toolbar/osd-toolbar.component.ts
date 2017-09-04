import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';

import { Dimensions } from './../../core/models/dimensions';
import { MimeResizeService } from './../../core/mime-resize-service/mime-resize.service';
import { MimeViewerIntl } from './../../core/viewer-intl';

@Component({
  selector: 'mime-osd-toolbar',
  templateUrl: './osd-toolbar.component.html',
  styleUrls: ['./osd-toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OsdToolbarComponent implements OnInit, OnDestroy {
  public osdToolbarStyle = {};
  private subscriptions: Array<Subscription> = [];

  constructor(
    public intl: MimeViewerIntl,
    private changeDetectorRef: ChangeDetectorRef,
    private mimeService: MimeResizeService) { }

  ngOnInit() {
    this.mimeService.onResize.subscribe((dimensions: Dimensions) => {
      this.osdToolbarStyle = {
        'top': (dimensions.top + 110) + 'px'
      };
      this.changeDetectorRef.detectChanges();
    });

  }

  ngOnDestroy() {
    this.subscriptions.forEach((subscription: Subscription) => {
      subscription.unsubscribe();
    });
  }

}
