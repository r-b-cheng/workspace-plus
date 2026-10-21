// A disposable native window for opt-in liveness tests; never touches user apps.
#import <Cocoa/Cocoa.h>
#import <stdio.h>

int main(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        __block NSWindow *window;
        @autoreleasepool {
        window = [[NSWindow alloc]
            initWithContentRect:NSMakeRect(120, 120, 360, 180)
            styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
            backing:NSBackingStoreBuffered defer:NO];
        window.releasedWhenClosed = NO;
        window.title = @"Workspace Hub liveness fixture";
        [window makeKeyAndOrderFront:nil];
        printf("%d %ld\n", getpid(), (long)window.windowNumber);
        fflush(stdout);
        }
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            char command[64];
            while (fgets(command, sizeof(command), stdin)) {
                NSString *action = [[NSString stringWithUTF8String:command]
                    stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
                dispatch_async(dispatch_get_main_queue(), ^{
                    @autoreleasepool {
                    if ([action isEqualToString:@"minimize"]) [window miniaturize:nil];
                    if ([action isEqualToString:@"untitle"]) window.title = @"";
                    if ([action isEqualToString:@"restore"]) [window deminiaturize:nil];
                    if ([action isEqualToString:@"close"]) { [window close]; window = nil; }
                    if ([action isEqualToString:@"quit"]) [NSApp terminate:nil];
                    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), dispatch_get_main_queue(), ^{
                        printf("done\n");
                        fflush(stdout);
                    });
                    }
                });
            }
            dispatch_async(dispatch_get_main_queue(), ^{ [NSApp terminate:nil]; });
        });
        [NSApp finishLaunching];
        while (YES) {
            @autoreleasepool {
                NSEvent *event = [NSApp nextEventMatchingMask:NSEventMaskAny
                    untilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]
                    inMode:NSDefaultRunLoopMode dequeue:YES];
                if (event) [NSApp sendEvent:event];
                [NSApp updateWindows];
            }
        }
    }
    return 0;
}
