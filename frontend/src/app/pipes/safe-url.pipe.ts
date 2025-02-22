import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeUrl, SafeResourceUrl } from '@angular/platform-browser';

@Pipe({
  name: 'safeUrl',
  standalone: true
})
export class SafeUrlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(url: string): SafeResourceUrl {
    if (!url) {
      return '';
    }
    // For PDF files, we need to use bypassSecurityTrustResourceUrl
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
} 