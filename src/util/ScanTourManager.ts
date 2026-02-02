import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRESETS_FILE_PATH = path.join(__dirname, '../../../data/intrusion-presets.json');
export interface IntrusionRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface IntrusionPreset {
    id: string;
    name: string;
    cameraId: "cam1" | "cam2";
    timestamp: number;
    rectangles: IntrusionRectangle[];
    presetNumber?: number;
    panAngle: number;
    tiltAngle: number;
    zoomLevel: number;
    timeInterval: number;
}

export interface ScanTourConfig {
    preset: IntrusionPreset;
    panStep: number;
    panRange?: { min: number; max: number };
}

export enum ScanTourStatus {
    RUNNING = 'running',
    PAUSED = 'paused',
    STOPPED = 'stopped',
}

export interface ScanTourState {
    presetId: string;
    cameraId: string;
    status: ScanTourStatus;
    currentPanAngle: number;
    panRange: { min: number; max: number };
    tiltAngle: number;
    zoomLevel: number;
    timeInterval: number;
}

/**
 * ScanTour class manages a single camera scan tour
 * Emits events: 'movement', 'paused', 'resumed', 'stopped', 'error'
 */
export class ScanTour extends EventEmitter {
    private preset: IntrusionPreset;
    private panStep: number;
    private currentPanAngle: number;
    private panRange: { min: number; max: number };
    private status: ScanTourStatus;
    private intervalId: NodeJS.Timeout | null = null;
    private ptzAPI: any; // PTZ API instance
    private backendUrl: string;

    constructor(config: ScanTourConfig, ptzAPI: any, backendUrl: string = 'http://localhost:9898') {
        super();

        this.preset = config.preset;
        this.panStep = Math.abs(config.panStep);
        this.currentPanAngle = 0; // Always start from 0°
        this.ptzAPI = ptzAPI;
        this.backendUrl = backendUrl;

        // Set pan range (always 0 to 360°)
        this.panRange = config.panRange || {
            min: 0,
            max: 360,
        };

        this.status = ScanTourStatus.STOPPED;
    }

    /**
     * Start the scan tour
     */
    async start(): Promise<void> {
        if (this.status === ScanTourStatus.RUNNING) {
            throw new Error('Scan tour is already running');
        }
        try {
            // Move to initial position (always start at 0°)
            await this.ptzAPI.positionAbsolute(
                0,
                this.preset.tiltAngle,
                this.preset.zoomLevel,
                0
            );

            console.log(`[ScanTour] Camera ${this.preset.cameraId} moved to initial position: Pan 0°, Tilt ${this.preset.tiltAngle}°, Zoom ${this.preset.zoomLevel}× (Step: ${this.panStep}°)`);

            // Send initial detection command to backend
            //await this.sendBackendUpdate();

            // Start the scan interval
            this.status = ScanTourStatus.RUNNING;
            this.startInterval();

            this.emit('started', this.getState());

            try {
                await fetch(`${this.backendUrl}/ia_process/intrusion/${this.preset.cameraId === 'cam1' ? 'cam2' : 'cam1'}/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ zones: this.preset.rectangles })
                });
            } catch (error: any) {
                console.error('[ScanTour] Backend stop error:', error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Pause the scan tour (keeps state, can resume)
     */
    pause(): void {
        if (this.status !== ScanTourStatus.RUNNING) {
            throw new Error('Scan tour is not running');
        }

        this.status = ScanTourStatus.PAUSED;
        console.log(`[ScanTour] Paused for ${this.preset.cameraId}`);
        this.emit('paused', this.getState());
    }

    /**
     * Resume the scan tour from paused state
     */
    resume(): void {
        if (this.status !== ScanTourStatus.PAUSED) {
            throw new Error('Scan tour is not paused');
        }

        this.status = ScanTourStatus.RUNNING;
        console.log(`[ScanTour] Resumed for ${this.preset.cameraId}`);
        this.emit('resumed', this.getState());
    }

    /**
     * Stop and cleanup the scan tour completely
     */
    async stop(): Promise<void> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.status = ScanTourStatus.STOPPED;

        // Send stop command to backend
        try {
            await fetch(`${this.backendUrl}/ia_process/intrusion/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error: any) {
            console.error('[ScanTour] Backend stop error:', error);
        }

        console.log(`[ScanTour] Stopped for ${this.preset.cameraId}`);
        this.emit('stopped', this.getState());
    }

    /**
     * Get current scan tour state
     */
    getState(): ScanTourState {
        return {
            presetId: this.preset.id,
            cameraId: this.preset.cameraId,
            status: this.status,
            currentPanAngle: this.currentPanAngle,
            panRange: this.panRange,
            tiltAngle: this.preset.tiltAngle,
            zoomLevel: this.preset.zoomLevel,
            timeInterval: this.preset.timeInterval,
        };
    }

    /**
     * Get camera ID
     */
    getCameraId(): string {
        return this.preset.cameraId;
    }

    /**
     * Get preset ID
     */
    getPresetId(): string {
        return this.preset.id;
    }

    /**
     * Check if running
     */
    isRunning(): boolean {
        return this.status === ScanTourStatus.RUNNING;
    }

    /**
     * Check if paused
     */
    isPaused(): boolean {
        return this.status === ScanTourStatus.PAUSED;
    }

    /**
     * Private: Start the interval timer
     */
    private startInterval(): void {
        this.intervalId = setInterval(async () => {
            if (this.status !== ScanTourStatus.RUNNING) {
                return; // Skip if paused or stopped
            }

            try {
                await this.performMovement();
            } catch (error: any) {
                console.error('[ScanTour] Movement error:', error);
                this.emit('error', error);
            }
        }, this.preset.timeInterval * 1000);
    }
    /**
     * Private: Perform one movement step
     */
    private async performMovement(): Promise<void> {
        // Calculate next pan angle
        this.currentPanAngle += this.panStep;

        // Wrap around at 360° (continuous rotation)
        if (this.currentPanAngle >= 360) {
            this.currentPanAngle = this.currentPanAngle % 360;
        } else if (this.currentPanAngle < 0) {
            this.currentPanAngle = 360 + (this.currentPanAngle % 360);
        }

        // Move camera
        await this.ptzAPI.positionAbsolute(
            this.currentPanAngle,
            this.preset.tiltAngle,
            this.preset.zoomLevel,
            0
        );

        console.log(`[ScanTour] ${this.preset.cameraId} moved to Pan ${this.currentPanAngle}°`);

        // Update backend
        //await this.sendBackendUpdate();

        // Emit movement event
        this.emit('movement', {
            cameraId: this.preset.cameraId,
            panAngle: this.currentPanAngle,
            tiltAngle: this.preset.tiltAngle,
            zoomLevel: this.preset.zoomLevel,
        });
    }

    /**
     * Private: Send update to backend
     */
    private async sendBackendUpdate(): Promise<void> {
        try {
            await fetch(`${this.backendUrl}/ia_process/intrusion/${this.preset.cameraId}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    zones: this.preset.rectangles,
                    panAngle: this.currentPanAngle,
                    tiltAngle: this.preset.tiltAngle,
                    zoomLevel: this.preset.zoomLevel,
                    timeInterval: this.preset.timeInterval,
                    cameraId: this.preset.cameraId,
                }),
            });
        } catch (error: any) {
            console.error('[ScanTour] Backend update error:', error);
            // Don't throw - backend errors shouldn't stop the tour
        }
    }
}

/**
 * ScanTourManager manages multiple scan tours
 * Singleton pattern to manage all active tours
 */
export class ScanTourManager extends EventEmitter {
    private tours: Map<string, ScanTour> = new Map();
    private static instance: ScanTourManager;

    private constructor() {
        super();
    }

    /**
     * Get singleton instance
     */
    static getInstance(): ScanTourManager {
        if (!ScanTourManager.instance) {
            ScanTourManager.instance = new ScanTourManager();
        }
        return ScanTourManager.instance;
    }

    /**
     * Load presets file
     */
    private loadPresetsFile(): any {
        try {
            if (fs.existsSync(PRESETS_FILE_PATH)) {
                const data = fs.readFileSync(PRESETS_FILE_PATH, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('[ScanTourManager] Error loading presets file:', error);
        }
        return { scanTourState: { status: 'stopped', activePresetId: null, cameraId: null, currentPanAngle: null, lastUpdated: null }, presets: [] };
    }

    /**
     * Save scan tour state to presets file
     */
    private saveScanTourState(state: { status: string; activePresetId: string | null; cameraId: string | null; currentPanAngle: number | null }): void {
        try {
            const data = this.loadPresetsFile();
            data.scanTourState = {
                ...state,
                lastUpdated: new Date().toISOString(),
            };
            fs.writeFileSync(PRESETS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
            console.log('[ScanTourManager] Scan tour state saved:', data.scanTourState);
        } catch (error) {
            console.error('[ScanTourManager] Error saving scan tour state:', error);
        }
    }

    /**
     * Get current scan tour state from file
     */
    getScanTourState(): any {
        const data = this.loadPresetsFile();
        return data.scanTourState || { status: 'stopped', activePresetId: null, cameraId: null, currentPanAngle: null, lastUpdated: null };
    }

    /**
     * Create and start a new scan tour
     */
    async startTour(config: ScanTourConfig, ptzAPI: any): Promise<ScanTour> {
        const { preset } = config;

        // Check if any tour is already running (only one tour at a time)
        if (this.tours.size > 0) {
            const runningTour = Array.from(this.tours.values())[0];
            throw new Error(`Only one scan tour can run at a time. Tour already active for ${runningTour.getCameraId()}`);
        }



        // Create new tour
        const tour = new ScanTour(config, ptzAPI);

        // Set up event listeners
        tour.on('started', (state) => {
            console.log(`[ScanTourManager] Tour started:`, state);
            this.saveScanTourState({
                status: 'running',
                activePresetId: preset.id,
                cameraId: preset.cameraId,
                currentPanAngle: state.currentPanAngle,
            });
            this.emit('tour-started', state);
        });

        tour.on('movement', (data) => {
            this.saveScanTourState({
                status: 'running',
                activePresetId: preset.id,
                cameraId: preset.cameraId,
                currentPanAngle: data.panAngle,
            });
            this.emit('tour-movement', data);
        });

        tour.on('paused', (state) => {
            console.log(`[ScanTourManager] Tour paused:`, state);
            this.saveScanTourState({
                status: 'paused',
                activePresetId: preset.id,
                cameraId: preset.cameraId,
                currentPanAngle: state.currentPanAngle,
            });
            this.emit('tour-paused', state);
        });

        tour.on('resumed', (state) => {
            console.log(`[ScanTourManager] Tour resumed:`, state);
            this.saveScanTourState({
                status: 'running',
                activePresetId: preset.id,
                cameraId: preset.cameraId,
                currentPanAngle: state.currentPanAngle,
            });
            this.emit('tour-resumed', state);
        });

        tour.on('stopped', (state) => {
            console.log(`[ScanTourManager] Tour stopped:`, state);
            this.tours.delete(preset.id);
            this.saveScanTourState({
                status: 'stopped',
                activePresetId: null,
                cameraId: null,
                currentPanAngle: null,
            });
            this.emit('tour-stopped', state);
        });

        tour.on('error', (error) => {
            console.error(`[ScanTourManager] Tour error:`, error);
            this.emit('tour-error', { presetId: preset.id, error });
        });

        // Store tour
        this.tours.set(preset.id, tour);

        // Start tour
        await tour.start();

        return tour;
    }

    /**
     * Get tour by preset ID
     */
    getTour(presetId: string): ScanTour | undefined {
        return this.tours.get(presetId);
    }

    /**
     * Get tour by camera ID
     */
    getTourByCamera(cameraId: string): ScanTour | undefined {
        return Array.from(this.tours.values()).find(
            (tour) => tour.getCameraId() === cameraId
        );
    }

    /**
     * Pause a tour
     */
    pauseTour(identifier: string): void {
        const tour = this.tours.get(identifier) || this.getTourByCamera(identifier);
        if (!tour) {
            throw new Error('Tour not found');
        }
        tour.pause();
    }

    /**
     * Resume a tour
     */
    resumeTour(identifier: string): void {
        const tour = this.tours.get(identifier) || this.getTourByCamera(identifier);
        if (!tour) {
            throw new Error('Tour not found');
        }
        tour.resume();
    }

    /**
     * Stop and remove a tour
     */
    async stopTour(identifier: string): Promise<void> {
        const tour = this.tours.get(identifier) || this.getTourByCamera(identifier);
        if (!tour) {
            throw new Error('Tour not found');
        }
        await tour.stop();
        this.tours.delete(tour.getPresetId());
    }

    /**
     * Get all active tours
     */
    getAllTours(): ScanTourState[] {
        return Array.from(this.tours.values()).map((tour) => tour.getState());
    }

    /**
     * Stop all tours
     */
    async stopAllTours(): Promise<void> {
        const stopPromises = Array.from(this.tours.values()).map((tour) => tour.stop());
        await Promise.all(stopPromises);
        this.tours.clear();
    }

    /**
     * Get count of active tours
     */
    getActiveCount(): number {
        return this.tours.size;
    }
}
