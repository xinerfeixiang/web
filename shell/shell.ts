/// <reference path="util.ts" />
/// <reference path="config.ts" />
/// <reference path="loader.ts" />
/// <reference path="settings.ts" />
/// <reference path="zoom.ts" />
/// <reference path="volume.ts" />
/// <reference path="cdda.ts" />
/// <reference path="audio.ts" />
/// <reference path="toolbar.ts" />

namespace xsystem35 {
    const Font = { url: 'fonts/MTLc3m.ttf', fname: 'MTLc3m.ttf'};
    export const xsys35rc = [
        'font_device: ttf',
        'ttfont_mincho: ' + Font.fname,
        'ttfont_gothic: ' + Font.fname, '',
    ].join('\n');
    export let fileSystemReady: Promise<any>;
    export let saveDirReady: Promise<any>;
    export let cdPlayer: CDPlayer;
    export let audio: AudioManager;
    export let settings: Settings;

    export class System35Shell {
        private params: URLSearchParams & Map<string, string>;
        private imageLoader: ImageLoader;
        status: HTMLElement = document.getElementById('status');
        private zoom: ZoomManager;
        private volumeControl: VolumeControl;
        private toolbar: ToolBar;
        private antialiasCheckbox: HTMLInputElement;

        constructor() {
            this.parseParams(location.search.slice(1));
            this.initModule();

            window.onerror = (message, url, line, column, error) => {
                let exDescription = JSON.stringify({message, url, line, column});
                ga('send', 'exception', {exDescription, exFatal: true});
                this.addToast('エラーが発生しました。', 'danger');
                window.onerror = null;
            };

            this.imageLoader = new ImageLoader(this);
            this.volumeControl = new VolumeControl();
            xsystem35.cdPlayer = new CDPlayer(this.imageLoader, this.volumeControl);
            this.zoom = new ZoomManager();
            this.toolbar = new ToolBar();
            this.antialiasCheckbox = <HTMLInputElement>$('#antialias');
            this.antialiasCheckbox.addEventListener('change', this.antialiasChanged.bind(this));
            this.antialiasCheckbox.checked = config.antialias;
            xsystem35.audio = new AudioManager(this.volumeControl);
            xsystem35.settings = new Settings();
        }

        private parseParams(searchParams: string) {
            if (typeof URLSearchParams !== 'undefined') {
                this.params = <URLSearchParams & Map<string, string>>new URLSearchParams(searchParams);
                return;
            }
            // For Edge
            this.params = <URLSearchParams & Map<string, string>>new Map();
            if (window.location.search.length > 1) {
                for (let item of searchParams.split('&')) {
                    let [key, value] = item.split('=');
                    this.params.set(key, value);
                }
            }
        }

        private initModule() {
            let fsReady: () => void;
            fileSystemReady = new Promise((resolve) => { fsReady = resolve; });
            let idbfsReady: () => void;
            saveDirReady = new Promise((resolve) => { idbfsReady = resolve; });

            Module.arguments = [];
            for (let [name, val] of this.params) {
                if (name.startsWith('-')) {
                    Module.arguments.push(name);
                    if (val)
                        Module.arguments.push(val);
                }
            }
            Module.print = Module.printErr = console.log.bind(console);
            Module.setWindowTitle = (title) => {
                let colon = title.indexOf(':');
                if (colon !== -1) {
                    title = title.slice(colon + 1);
                    $('.navbar-brand').textContent = title;
                    ga('set', 'dimension1', title);
                    ga('send', 'event', 'Game', 'GameStart', title);
                }
            };
            Module.canvas = <HTMLCanvasElement>document.getElementById('canvas');
            Module.preRun = [
                () => { Module.addRunDependency('gameFiles'); },
                fsReady,
                function loadFont() {
                    FS.createPreloadedFile('/', Font.fname, Font.url, true, false);
                },
                function prepareSaveDir() {
                    FS.mkdir('/save');
                    FS.mount(IDBFS, {}, '/save');
                    Module.addRunDependency('syncfs');
                    FS.syncfs(true, (err) => {
                        Module.removeRunDependency('syncfs');
                        idbfsReady();
                    });
                },
            ];
        }

        loadModule(name: 'system3' | 'xsystem35'): Promise<any> {
            let useWasm = typeof WebAssembly === 'object' && this.params.get('wasm') !== '0';
            let src = name + (useWasm ? '.js' : '.asm.js');
            let script = document.createElement('script');
            script.src = src;
            script.onerror = () => {
                ga('send', 'event', 'Game', 'ModuleLoadFailed', src);
                this.addToast(src + 'の読み込みに失敗しました。リロードしてください。', 'danger');
            };
            document.body.appendChild(script);
            let start = performance.now();
            return xsystem35.fileSystemReady.then(() => {
                ga('send', 'timing', 'Module load', src, Math.round(performance.now() - start));
                $('#loader').hidden = true;
                document.body.classList.add('bgblack-fade');
                this.toolbar.setCloseable();
            });
        }

        loaded() {
            $('#xsystem35').hidden = false;
            $('#toolbar').classList.remove('before-game-start');
            setTimeout(() => {
                if (this.antialiasCheckbox.checked)
                    Module.arguments.push('-antialias');
                Module.removeRunDependency('gameFiles');
            }, 0);
        }

        windowSizeChanged() {
            this.zoom.handleZoom();
        }

        addToast(msg: string | Node, type?: 'success' | 'danger'): HTMLElement {
            let container = $('.toast-container');
            let div = document.createElement('div');
            div.classList.add('toast');
            if (type)
                div.classList.add('toast-' + type);
            if (typeof msg === 'string')
                div.innerText = msg;
            else
                div.appendChild(msg);
            let btn = document.createElement('button');
            btn.setAttribute('class', 'btn btn-clear float-right');
            function dismiss() { container.removeChild(div); }
            btn.addEventListener('click', dismiss);
            if (type !== 'danger')
                setTimeout(dismiss, 5000);
            div.insertBefore(btn, div.firstChild);
            container.insertBefore(div, container.firstChild);
            return div;
        }

        private fsyncTimer: number;
        syncfs(timeout = 100) {
            window.clearTimeout(this.fsyncTimer);
            this.fsyncTimer = window.setTimeout(() => {
                FS.syncfs(false, (err) => {
                    if (err)
                        console.log('FS.syncfs error: ', err);
                });
            }, timeout);
        }

        private antialiasChanged() {
            config.antialias = this.antialiasCheckbox.checked;
            config.persist();
            if (!$('#xsystem35').hidden)
                _ags_setAntialiasedStringMode(this.antialiasCheckbox.checked ? 1 : 0);
        }
    }

    export let shell = new System35Shell();
}
