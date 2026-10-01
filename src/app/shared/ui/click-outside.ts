import { Directive, ElementRef, inject, output } from '@angular/core';

/** Emits when the user clicks anywhere outside the host element (used to close menus). */
@Directive({
  selector: '[appClickOutside]',
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class ClickOutside {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly appClickOutside = output<void>();

  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && target.isConnected && !this.host.nativeElement.contains(target)) this.appClickOutside.emit();
  }
}
