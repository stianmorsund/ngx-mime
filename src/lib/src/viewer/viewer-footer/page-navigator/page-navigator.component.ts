import { Component, OnInit, OnDestroy, ChangeDetectorRef, Input } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { MdSliderChange } from '@angular/material';
import { Subscription } from 'rxjs/Subscription';

import { MimeViewerIntl } from './../../../core/intl/viewer-intl';
import { ViewerService } from './../../../core/viewer-service/viewer.service';
import { PageService } from './../../../core/page-service/page-service';
import { SearchResult } from './../../../core/models/search-result';

@Component({
  selector: 'mime-page-navigator',
  templateUrl: './page-navigator.component.html',
  styleUrls: ['./page-navigator.component.scss']
})
export class PageNavigatorComponent implements OnInit, OnDestroy {
  @Input() public searchResult: SearchResult;
  public numberOfPages: number;
  public currentPage: number;
  public isFirstPage: boolean;
  public isLastPage: boolean;
  private currentSliderPage = -1;
  private subscriptions: Array<Subscription> = [];

  constructor(
    public intl: MimeViewerIntl,
    private changeDetectorRef: ChangeDetectorRef,
    private viewerService: ViewerService,
    private pageService: PageService
  ) { }

  ngOnInit() {
    this.subscriptions.push(this.viewerService
      .onPageChange
      .subscribe((currentPage: number) => {
        if (this.currentSliderPage !== -1 && this.currentSliderPage === currentPage) {
          this.currentSliderPage = -1;
        } else if (this.currentSliderPage === -1) {
          this.currentPage = currentPage;
        }
        this.numberOfPages = this.pageService.numberOfPages;
        this.isFirstPage = this.isOnFirstPage(currentPage);
        this.isLastPage = this.isOnLastPage(currentPage);
        this.changeDetectorRef.detectChanges();
      }));
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

  public onSliderChange(change: MdSliderChange): void {
    this.currentSliderPage = change.value;
    this.currentPage = change.value;
    this.viewerService.goToPage(change.value);
    this.changeDetectorRef.detectChanges();
  }

  private isOnFirstPage(currentPage: number): boolean {
    return currentPage === 0;
  }

  private isOnLastPage(currentPage: number): boolean {
    return currentPage === (this.numberOfPages - 1);
  }

}
