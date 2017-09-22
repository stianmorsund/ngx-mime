import { BehaviorSubject, Subject } from 'rxjs/Rx';
import { Subscription } from 'rxjs/Subscription';
import { Observable } from 'rxjs/Observable';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { Injectable, NgZone, OnInit } from '@angular/core';

import { PanDirection } from '../models/pan-direction';
import { CenterPoints } from './../models/page-center-point';
import { CustomOptions } from '../models/options-custom';
import { Utils } from '../../core/utils';
import { ModeService } from '../../core/mode-service/mode.service';
import { Dimensions } from '../models/dimensions';
import { Manifest, Service } from '../models/manifest';
import { Options } from '../models/options';
import { PageService } from '../page-service/page-service';
import { ViewerMode } from '../models/viewer-mode';
import { PagePositionUtils } from './page-position-utils';
import { SwipeUtils } from './swipe-utils';
import { ZoomAnimation } from './zoom-animation';
import { CalculateNextPageFactory } from './calculate-next-page-factory';
import { Point } from './../models/point';
import { ClickService } from '../click-service/click.service';

import '../ext/svg-overlay';
import '../../rxjs-extension';
import * as d3 from 'd3';

declare const OpenSeadragon: any;

@Injectable()
export class ViewerService implements OnInit {

  private viewer: any;
  private svgNode: any;
  private options: Options;

  private overlays: Array<SVGRectElement>;
  private tileSources: Array<Service>;
  private subscriptions: Array<Subscription> = [];

  private containerPadding: Dimensions = new Dimensions();

  public isCurrentPageFittedViewport = false;
  public isCanvasPressed: Subject<boolean> = new Subject<boolean>();


  private currentCenter: ReplaySubject<Point> = new ReplaySubject();
  private currentPageIndex: ReplaySubject<number> = new ReplaySubject();
  private dragStartPosition: any;
  private centerPoints = new CenterPoints();

  constructor(
    private zone: NgZone,
    private clickService: ClickService,
    private pageService: PageService,
    private modeService: ModeService) { }

  ngOnInit(): void { }

  get onCenterChange(): Observable<Point> {
    return this.currentCenter.asObservable();
  }

  get onPageChange(): Observable<number> {
    return this.currentPageIndex.asObservable().distinctUntilChanged();
  }

  public getViewer(): any {
    return this.viewer;
  }

  public getTilesources(): Service[] {
    return this.tileSources;
  }

  public getOverlays(): SVGRectElement[] {
    return this.overlays;
  }

  public getZoom(): number {
    return this.shortenDecimals(this.viewer.viewport.getZoom(true), 5);
  }

  public getMinZoom(): number {
    return this.shortenDecimals(this.viewer.viewport.getMinZoom(), 5);
  }

  public getMaxZoom(): number {
    return this.shortenDecimals(this.viewer.viewport.getMaxZoom(), 5);
  }

  public zoomTo(level: number): void {
    this.viewer.viewport.zoomTo(level);
  }

  public home(): void {
    const viewportCenter = this.getViewportCenter();
    const currentPageIndex = this.centerPoints.findClosestIndex(viewportCenter);

    this.goToPage(currentPageIndex);
    this.goToHomeZoom();
  }

  public goToPreviousPage(): void {
    const viewportCenter = this.getViewportCenter();
    const currentPageIndex = this.centerPoints.findClosestIndex(viewportCenter);

    const calculateNextPageStrategy = CalculateNextPageFactory.create(null);
    const newPageIndex = calculateNextPageStrategy.calculateNextPage({
      direction: 'previous',
      currentPageIndex: currentPageIndex,
    });
    this.goToPage(newPageIndex);
  }

  public goToNextPage(): void {
    const viewportCenter = this.getViewportCenter();
    const currentPageIndex = this.centerPoints.findClosestIndex(viewportCenter);

    const calculateNextPageStrategy = CalculateNextPageFactory.create(null);
    const newPageIndex = calculateNextPageStrategy.calculateNextPage({
      direction: 'next',
      currentPageIndex: currentPageIndex,
    });
    this.goToPage(newPageIndex);
  }

  public goToPage(pageIndex: number): void {
    this.pageService.currentPage = pageIndex;
    const newPageCenter = this.centerPoints.get(pageIndex);
    this.panTo(newPageCenter.x, newPageCenter.y);
    this.resizeViewportContainerToFitPage(this.createRectangle(this.overlays[pageIndex]));
  }

  public updatePadding(padding: Dimensions): void {
    // TODO: Check whether padding has changed properly
    if (this.containerPadding.top !== padding.top) {
      this.paddingChanged(padding);
      this.containerPadding = padding;
    }

  }

  setUpViewer(manifest: Manifest) {
    if (manifest.tileSource) {
      this.tileSources = manifest.tileSource;
      this.zone.runOutsideAngular(() => {
        this.clearOpenSeadragonTooltips();
        this.options = new Options();
        this.viewer = new OpenSeadragon.Viewer(Object.assign({}, this.options));
        this.pageService.reset();
        this.pageService.numberOfPages = this.tileSources.length;
      });

      this.subscriptions.push(this.modeService.onChange.subscribe((mode: ViewerMode) => {
        this.setSettings(mode);
      }));

      this.subscriptions.push(this.onCenterChange.throttle(val => Observable.interval(500)).subscribe((center: Point) => {
        this.calculateCurrentPage(center);
      }));

      this.addToWindow();
      this.createOverlays();
      this.addEvents();
    }
  }

  addToWindow() {
    window.openSeadragonViewer = this.viewer;
  }

  destroy() {
    if (this.viewer != null && this.viewer.isOpen()) {
      this.viewer.destroy();
    }
    this.subscriptions.forEach((subscription: Subscription) => {
      subscription.unsubscribe();
    });
    this.centerPoints = new CenterPoints();
  }

  addEvents(): void {
    this.addOverrides();
    this.clickService.reset();
    this.clickService.addSingleClickHandler(this.singleClickHandler);
    this.clickService.addDoubleClickHandler(this.dblClickHandler);
    this.viewer.addHandler('animation-start', () => { });
    this.viewer.addHandler('animation-finish', this.animationsEndCallback);
    this.viewer.addHandler('canvas-click', this.clickService.click);
    this.viewer.addHandler('canvas-double-click', (e: any) => e.preventDefaultAction = true);
    this.viewer.addHandler('canvas-press', (e: any) => {
      this.dragStartPosition = e.position;
      this.isCanvasPressed.next(true);
    });
    this.viewer.addHandler('canvas-release', () => this.isCanvasPressed.next(false));
    this.viewer.addHandler('canvas-scroll', this.scrollToggleMode);
    this.viewer.addHandler('canvas-pinch', this.pinchToggleMode);

    this.viewer.addHandler('canvas-drag-end', (e: any) => {
      this.swipeToPage(e);
    });
    this.viewer.addHandler('animation', (e: any) => {
      this.currentCenter.next(this.viewer.viewport.getCenter(true));
    });
  }


  zoomIn(): void {
    this.modeService.mode = ViewerMode.PAGE_ZOOMED;
    this.zoomTo(this.getZoom() + CustomOptions.zoom.zoomFactor);
    // this.zoomTo(this.getZoom() * this.options.zoomPerClick);

    this.viewer.addOnceHandler('animation-finish', () => {
      this.resizeViewportContainerToFitPage();
   });

  }

  zoomOut(): void {
    if (this.modeService.mode === ViewerMode.PAGE) {
      return;
    }
    if (this.isViewportLargerThanPage()) {
      this.toggleToPage();
    } else {
      this.zoomTo(this.getZoom() - CustomOptions.zoom.zoomFactor);
    }

    this.viewer.addOnceHandler('animation-finish', () => {
      this.resizeViewportContainerToFitPage();
   });
  }


  /**
   * Overrides for default OSD-functions
   */
  addOverrides(): void {
    // Raised when viewer loads first time
    // TODO: Reimplement go home override (current version causes incorrect zoom at start-up)
    // this.viewer.viewport.goHome = () => {
    //   this.viewer.raiseEvent('home');
    //   this.modeService.initialMode === ViewerMode.DASHBOARD ? this.toggleToDashboard() : this.toggleToPage();
    // };
  }


  /**
   * Set settings for page/dashboard-mode
   * @param mode ViewerMode
   */
  setSettings(mode: ViewerMode) {
    if (mode === ViewerMode.DASHBOARD) {
      this.setDashboardSettings();
    } else if (mode === ViewerMode.PAGE) {
      this.setPageSettings();
    }
  }

  /**
   * Set settings for dashboard-mode
   */
  setDashboardSettings(): void {
    this.viewer.panVertical = false;
    this.viewer.gestureSettingsTouch.pinchToZoom = false;
    this.viewer.gestureSettingsMouse.scrollToZoom = false;
  }

  /**
   * Set settings for page-mode
   */
  setPageSettings(): void {
    this.viewer.panVertical = true;
    this.viewer.gestureSettingsTouch.pinchToZoom = false;
    this.viewer.gestureSettingsMouse.scrollToZoom = false;
  }

  /**
   * Switches to DASHBOARD-mode, repositions pages and removes max-width on viewer
   */
  toggleToDashboard(): void {
    if (!this.pageService.isCurrentPageValid()) {
      return;
    }
    this.modeService.mode = ViewerMode.DASHBOARD;
    this.goToPage(this.pageService.currentPage);

    PagePositionUtils.updatePagePositions(
      this.viewer, this.pageService.currentPage, CustomOptions.overlays.pageMarginDashboardView, this.overlays, this.centerPoints
    );

    d3.select(this.viewer.container.parentNode).style('max-width', '');
  }

  /**
   * Switches to PAGE-mode, centers currentPage and repositions pages other pages
   */
  toggleToPage(): void {
    if (!this.pageService.isCurrentPageValid()) {
      return;
    }
    this.modeService.mode = ViewerMode.PAGE;

    this.fitBounds((this.overlays[this.pageService.currentPage]));

    this.goToHomeZoom();

    //this.goToPage(this.pageService.currentPage);


    // PagePositionUtils.updatePagePositions(
    //   this.viewer, this.pageService.currentPage, CustomOptions.overlays.pageMarginPageView, this.overlays, this.centerPoints);
  }

  /**
   * Scroll-toggle-handler
   * Scroll-up dashboard-mode: Toggle page-mode
   * Scroll-down page-mode: Toggle dashboard-mode if page is at min-zoom
   */
  scrollToggleMode = (e: any) => {
    const event = e.originalEvent;
    const delta = (event.wheelDelta) ? event.wheelDelta : -event.deltaY;

    // Scrolling up
    if (delta > 0) {
      this.zoomInGesture();
      // Scrolling down
    } else if (delta < 0) {
      this.zoomOutGesture();
    }
  }

  /**
   * Pinch-toggle-handler
   * Pinch-out dashboard-mode: Toggles page-mode
   * Pinch-in page-mode: Toggles dashboard-mode if page is at min-zoom
   */
  pinchToggleMode = (event: any) => {
    // Pinch Out
    if (event.distance > event.lastDistance) {
      this.zoomInGesture();
      // Pinch In
    } else {
      this.zoomOutGesture();
    }
  }

  zoomInGesture(): void {
    if (this.modeService.mode === ViewerMode.DASHBOARD) {
      this.toggleToPage();
    } else {
      this.zoomIn();
    }
  }

  zoomOutGesture(): void {
    if (this.modeService.mode === ViewerMode.PAGE || this.modeService.mode === ViewerMode.PAGE_ZOOMED) {
      if (this.isViewportLargerThanPage()) {
        this.toggleToDashboard();
      } else {
        this.zoomOut();
      }
    }
  }

  /**
   * Adds single-click-handler
   * Single-click toggles between page/dashboard-mode if a page is hit
   */
  singleClickHandler = (event: any) => {
    const target = event.originalEvent.target;
    const requestedPage = this.getOverlayIndexFromClickEvent(target);
    if (requestedPage) {
      this.pageService.currentPage = requestedPage;
    }
    this.modeService.toggleMode();
    this.modeService.mode === ViewerMode.PAGE ? this.toggleToPage() : this.toggleToDashboard();
  }

  /**
   * Double-click-handler
   * Double-click dashboard-mode should go to page-mode
   * Double-click page-mode should
   *    a) Zoom in if page is fitted vertically, or
   *    b) Fit vertically if page is already zoomed in
   */
  dblClickHandler = (event: any) => {
    const target = event.originalEvent.target;
    // Page is fitted vertically, so dbl-click zooms in
    if (this.modeService.mode === ViewerMode.PAGE) {

      //this.modeService.mode = ViewerMode.PAGE_ZOOMED;
      //this.zoomTo(this.getZoom() * this.options.zoomPerClick);
      this.zoomIn();
    } else {

      this.modeService.mode = ViewerMode.PAGE;
      const requestedPage: number = this.getOverlayIndexFromClickEvent(target);
      if (requestedPage >= 0) {
        this.pageService.currentPage = requestedPage;
      }
      this.toggleToPage();
    }
  }

  /**
   * Called each time an animation ends
   */
  animationsEndCallback = () => {
    //this.setModeCallback();

  }

  isViewportLargerThanPage(): boolean {
    const pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
    const viewportBounds = this.viewer.viewport.getBounds();
    const pbWidth = Math.round(pageBounds.width);
    const pbHeight = Math.round(pageBounds.height);
    const vpWidth = Math.round(viewportBounds.width);
    const vpHeight = Math.round(viewportBounds.height);

    // console.log("page height", pbHeight)
    // console.log("vp height", vpHeight)
    return (vpHeight >= pbHeight)
    //|| (vpWidth >= pbWidth);
    //return (pbWidth <= vpWidth) || (pbHeight <= vpHeight);
  }

  setModeCallback() {
    const pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
    const viewportBounds = this.viewer.viewport.getBounds();
    const widthIsFitted = Utils.numbersAreClose(pageBounds.width, viewportBounds.width, 5);
    const heightIsFitted = Utils.numbersAreClose(pageBounds.height, viewportBounds.height, 5);

    if (
      widthIsFitted || heightIsFitted
    ) {
      console.log('switching to PAGE-mode');
      this.modeService.mode = ViewerMode.PAGE;
    } else if (
      this.getZoom() === this.getHomeZoom()
    ) {

    } else if (
      (Math.round(pageBounds.width) > Math.round(viewportBounds.width)) ||
      (Math.round(pageBounds.height) > Math.round(viewportBounds.height))
    ) {
      console.log('switching to PAGE_ZOOMED-mode');
      this.modeService.mode = ViewerMode.PAGE_ZOOMED;
    }
  }

  // isZoomedInPageMode(): boolean {
  //   const pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
  //   const viewportBounds = this.viewer.viewport.getBounds();

  //   // const widthIsFitted = Utils.numbersAreClose(svgParentDimensions.width, overlayDimensions.width, 5);
  //   // const heightIsFitted = Utils.numbersAreClose(svgParentDimensions.height, overlayDimensions.height, 5);
  //   console.log("pageBounds.width", Math.round(pageBounds.width))
  //   console.log("vpwidth", Math.round(viewportBounds.width))
  //   return (
  //     Math.round(pageBounds.width) > Math.round(viewportBounds.width)) ||
  //     (Math.round(pageBounds.height) > Math.round(viewportBounds.height)

  //   );
  // }

  /**
   * Checks if hit element is a <rect>-element
   * @param target
   */
  isPageHit(target: HTMLElement): boolean {
    return target instanceof SVGRectElement;
  }

  /**
   * Iterates tilesources and adds them to viewer
   * Creates svg clickable overlays for each tile
   */
  createOverlays(): void {
    this.overlays = [];
    const svgOverlay = this.viewer.svgOverlay();
    this.svgNode = d3.select(svgOverlay.node());

    let center = new OpenSeadragon.Point(0, 0);
    let currentX = center.x - (this.tileSources[0].width / 2);
    let height = this.tileSources[0].height;


    this.tileSources.forEach((tile, i) => {

      if (tile.height !== height) {
        let heightChangeRatio = height / tile.height;
        tile.height = height;
        tile.width = heightChangeRatio * tile.width;
      }

      let currentY = center.y - tile.height / 2;
      this.zone.runOutsideAngular(() => {
        this.viewer.addTiledImage({
          index: i,
          tileSource: tile,
          height: tile.height,
          x: currentX,
          y: currentY
        });
      });

      // Style overlay to match tile
      this.svgNode.append('rect')
        .attr('x', currentX)
        .attr('y', currentY)
        .attr('width', tile.width)
        .attr('height', tile.height)
        .attr('class', 'tile');

      const currentOverlay: SVGRectElement = this.svgNode.node().childNodes[i];
      this.overlays.push(currentOverlay);

      this.centerPoints.add({
        x: currentX + (tile.width / 2),
        y: currentY + (tile.height / 2)
      });

      currentX = currentX + tile.width + CustomOptions.overlays.pageMarginPageView;
    });
  }


  /**
   * Fit viewport bounds to an overlay
   * @param {SVGRectElement} overlay
   */
  fitBounds(overlay: SVGRectElement): void {
    this.viewer.viewport.fitBounds(this.createRectangle(overlay));
  }

  /**
   * Returns an OpenSeadragon.Rectangle instance of an overlay
   * @param {SVGRectElement} overlay
   */
  createRectangle(overlay: SVGRectElement): any {
    return new OpenSeadragon.Rect(
      overlay.x.baseVal.value,
      overlay.y.baseVal.value,
      overlay.width.baseVal.value,
      overlay.height.baseVal.value
    );
  }

  /**
   * Returns overlay-index for click-event if hit
   * @param target hit <rect>
   */
  getOverlayIndexFromClickEvent(target: any) {
    if (this.isPageHit(target)) {
      const requestedPage: number = this.overlays.indexOf(target);
      if (requestedPage >= 0) {
        return requestedPage;
      }
    }
    return -1;
  }


  private clearOpenSeadragonTooltips() {
    OpenSeadragon.setString('Tooltips.Home', '');
    OpenSeadragon.setString('Tooltips.ZoomOut', '');
    OpenSeadragon.setString('Tooltips.ZoomIn', '');
    OpenSeadragon.setString('Tooltips.NextPage', '');
    OpenSeadragon.setString('Tooltips.ZoomIn', '');
    OpenSeadragon.setString('Tooltips.FullPage', '');
  }

  private shortenDecimals(zoom: any, precision: number): number {
    const short = Number(zoom).toPrecision(precision);
    return Number(short);
  }

  private calculateCurrentPage(center: Point) {
    const currentPageIndex = this.centerPoints.findClosestIndex(center);
    this.currentPageIndex.next(currentPageIndex);
  }

  private getViewportCenter(): Point {
    return this.viewer.viewport.getCenter(true);
  }

  private swipeToPage(e: any) {
    const speed: number = e.speed;
    const dragEndPosision = e.position;

    const pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
    const viewportBounds = this.viewer.viewport.getBounds();

    const direction = SwipeUtils.getSwipeDirection(this.dragStartPosition.x, dragEndPosision.x);
    const viewportCenter = this.getViewportCenter();

    const currentPageIndex = this.pageService.currentPage;
    const isPanningPastCenter = SwipeUtils.isPanningPastCenter(pageBounds, viewportBounds);
    const calculateNextPageStrategy = CalculateNextPageFactory.create(this.modeService.mode);

    const newPageIndex = calculateNextPageStrategy.calculateNextPage({
      isPastCenter: isPanningPastCenter,
      speed: speed,
      direction: direction,
      currentPageIndex: currentPageIndex,
    });

    if (this.modeService.mode === ViewerMode.DASHBOARD || this.modeService.mode === ViewerMode.PAGE) {
      console.log("swiping with dash or page")
      this.goToPage(newPageIndex);

    } else if (this.modeService.mode === ViewerMode.PAGE_ZOOMED) {
      console.log("swiping with zoomed in")
      // We need to zoom out before we go to next page in zoomed-in-mode
      if (SwipeUtils.isPanningOutsidePage(pageBounds, viewportBounds)) {
        this.fitBounds(this.overlays[this.pageService.currentPage]);
        this.modeService.mode = ViewerMode.PAGE;
        setTimeout(() => {
          this.goToPage(newPageIndex);
        }, CustomOptions.transitions.OSDAnimationTime);
      }
    }
  }

  private panTo(x: number, y: number): void {
    this.viewer.viewport.panTo({
      x: x,
      y: y
    }, false);
  }

  resizeViewportContainerToFitPage = (pageBounds?: any): void => {
    if (this.modeService.mode === ViewerMode.DASHBOARD) {
      return;
    }

    const container = d3.select(this.viewer.container.parentNode);

    if (!pageBounds) {
      pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
    }

    const widthVector = new OpenSeadragon.Point(pageBounds.width, 0);
    const widthInPixels = Math.ceil(this.viewer.viewport.deltaPixelsFromPoints(widthVector).x);
    container.style('max-width', widthInPixels + 'px');
  }

  private paddingChanged(newPadding: Dimensions): void {
    if (!this.viewer) {
      return;
    }

    const container = d3.select(this.viewer.container.parentNode);
    this.setPadding(container, new Dimensions());

    const maxViewportDimensions = new Dimensions(d3.select(this.viewer.container.parentNode.parentNode).node().getBoundingClientRect());
    const viewportHeight = maxViewportDimensions.height - newPadding.top - newPadding.bottom;
    const viewportWidth = maxViewportDimensions.width - newPadding.left - newPadding.right;

    const viewportSizeInViewportCoordinates =
      this.viewer.viewport.deltaPointsFromPixels(
        new OpenSeadragon.Point(viewportWidth, viewportHeight)
      );
    const viewportBounds = new OpenSeadragon.Rect(0, 0, viewportSizeInViewportCoordinates.x, viewportSizeInViewportCoordinates.y);

    ZoomAnimation.animateZoom(this.viewer.viewport, this.getHomeZoom(viewportBounds), 100, this.resizeViewportContainerToFitPage);

    setTimeout(() => {
      this.setPadding(container, newPadding);
    }, this.options.animationTime * 1000);

  }

  private setPadding(element: any, padding: Dimensions): void {
    element.style('padding', padding.top + 'px ' + padding.right + 'px ' + padding.bottom + 'px ' + padding.left + 'px');
  }

  private goToHomeZoom(viewportBounds?: any): void {
    this.viewer.viewport.zoomTo(this.getHomeZoom(viewportBounds), false);
    this.resizeViewportContainerToFitPage();
  }

  private getHomeZoom(viewportBounds?: any, pageBounds?: any): number {

    if (!viewportBounds) {
      viewportBounds = this.viewer.viewport.getBounds();
    }

    if (!pageBounds) {
      pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
    }

    const currentZoom: number = this.viewer.viewport.getZoom();
    const resizeRatio: number = viewportBounds.height / pageBounds.height;

    if (resizeRatio * pageBounds.width <= viewportBounds.width) {
      return this.shortenDecimals(resizeRatio * currentZoom, 5);
    } else {
      // Page at full height is wider than viewport.  Return fit by width instead.
      return this.shortenDecimals(viewportBounds.width / pageBounds.width * currentZoom, 5);
    }
  }

}
