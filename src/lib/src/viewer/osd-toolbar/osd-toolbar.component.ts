import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';
import { trigger, state, style, animate, transition } from '@angular/animations';

import { Dimensions } from './../../core/models/dimensions';
import { MimeResizeService } from './../../core/mime-resize-service/mime-resize.service';
import { MimeViewerIntl } from './../../core/intl/viewer-intl';
import { ViewerService } from './../../core/viewer-service/viewer.service';
import { PageService } from './../../core/page-service/page-service';
import { ViewerOptions } from '../../core/models/viewer-options';

@Component({
  selector: 'mime-osd-toolbar',
  templateUrl: './osd-toolbar.component.html',
  styleUrls: ['./osd-toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('osdToolbarState', [
      state('hide', style({
        opacity: 0,
        display: 'none',
        transform: 'translate(-100%,0)'
      })),
      state('show', style({
        opacity: 1,
        display: 'block'
      })),
      transition('hide => show', animate(ViewerOptions.transitions.toolbarsEaseOutTime + 'ms ease-out')),
      transition('show => hide', animate(ViewerOptions.transitions.toolbarsEaseInTime + 'ms ease-in'))
    ])
  ],
  host: {
    '[@osdToolbarState]': 'state'
  }
})
export class OsdToolbarComponent implements OnInit, OnDestroy {
  public osdToolbarStyle = {};
  public numberOfPages: number;
  public isFirstPage: boolean;
  public isLastPage: boolean;
  private subscriptions: Array<Subscription> = [];
  public state = 'show';

  constructor(
    public intl: MimeViewerIntl,
    private changeDetectorRef: ChangeDetectorRef,
    private mimeService: MimeResizeService,
    private viewerService: ViewerService,
    private pageService: PageService) { }

  ngOnInit() {
    this.subscriptions.push(this.mimeService.onResize.subscribe((dimensions: Dimensions) => {
      this.osdToolbarStyle = {
        'top': (dimensions.top + 110) + 'px'
      };
      this.changeDetectorRef.detectChanges();
    }));

    this.subscriptions.push(this.viewerService
      .onPageChange
      .subscribe((currentPage: number) => {
        this.numberOfPages = this.pageService.numberOfPages;
        this.isFirstPage = this.isOnFirstPage(currentPage);
        this.isLastPage = this.isOnLastPage(currentPage);
        this.changeDetectorRef.detectChanges();
      }));

    this.subscriptions.push(this.intl.changes.subscribe(() => this.changeDetectorRef.markForCheck()));
  }

  zoomIn(): void {
    this.viewerService.zoomIn();
  }

  zoomOut(): void {
    this.viewerService.zoomOut();
  }

  home(): void {
    this.viewerService.home();
  }

  ngOnDestroy() {
    this.subscriptions.forEach((subscription: Subscription) => {
      subscription.unsubscribe();
    });
  }

  public goToPreviousPage(): void {
    this.viewerService.goToPreviousPage();
  }

  public goToNextPage(): void {
    this.viewerService.goToNextPage();
  }

  private isOnFirstPage(currentPage: number): boolean {
    return currentPage === 0;
  }

  private isOnLastPage(currentPage: number): boolean {
    return currentPage === (this.numberOfPages - 1);
  }

}
