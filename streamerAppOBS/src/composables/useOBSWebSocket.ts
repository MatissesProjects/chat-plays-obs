import { ref, onUnmounted, Ref } from 'vue';
import { OBSConnectionStatus, useStatusStore } from '../store/statusStore';
import { useConfigStore } from '../store/configStore';
import OBSWebSocket, { OBSWebSocketError } from 'obs-websocket-js';

export function useOBSWebSocket() {

    const statusStore = useStatusStore();
    const configStore = useConfigStore();
    const onOpenCallback: Ref<null | (() => void)> = ref(null);

    let socket = ref<OBSWebSocket | null>();

    const connect = async () => {
        close();
        console.log("useOBSWebSocket: connect()");

        socket.value = new OBSWebSocket();
        const protocol = "ws";
        const address = `${protocol}://${configStore.obsHost}:${configStore.obsPort}`;


        // We have to wait for the "Hello" and "Identified"
        // before we kick off barking orders at OBS
        socket.value.on('Identified', async () => {
            console.log("\tOBS is connected!");

            statusStore.obsConnectionStatus = OBSConnectionStatus.Open;

            if (onOpenCallback.value != null) {
                onOpenCallback.value();
            }
        });

        statusStore.obsConnectionStatus = OBSConnectionStatus.Connecting;
        await socket.value.connect(address, configStore.obsPassword).catch((e) => {
            console.warn("caught error:", e, e.code, e.name, e.message);
            if (e instanceof OBSWebSocketError && e.message == "Authentication failed.") {
                console.warn("OBS authentication error");
                statusStore.generalErrorMessage = e.message;
                statusStore.obsConnectionStatus = OBSConnectionStatus.AuthenticationError;
            } else {
                statusStore.generalErrorMessage = `OBS Connection Error: ${e.message}`;
            }
            throw e;
        });

        socket.value.on('ConnectionClosed', () => {
            console.log("OBS WebSocket has ConnectionClosed!");
            statusStore.obsConnectionStatus = OBSConnectionStatus.Closed;
        });
    }

    const close = () => {
        if (socket.value) {
            console.log("useOBSWebSocket: close()");
            statusStore.obsConnectionStatus = OBSConnectionStatus.Closing;
            socket.value.disconnect();
            socket.value = null;
            statusStore.obsConnectionStatus = OBSConnectionStatus.Closed;
        }
    }

    const getVideoSettings = async () => {
        if (!socket.value) throw Error("OBS Disconnected.");

        const res = await socket.value.call('GetVideoSettings');
        console.log("useOBSWebSocket: getVideoSettings() response:", res);
        return res;
    }

    const getSceneItems = async () => {
        if (!socket.value) throw Error("OBS Disconnected.");

        const sceneName = configStore.obsSceneName;

        try {
            const res = await socket.value.call('GetSceneItemList', { sceneName })
            console.log("useOBSWebSocket: getSceneItems() response:", res);
            return res.sceneItems;
        } catch (e) {
            if (e instanceof OBSWebSocketError && e.message.includes('No source')) {
                console.warn("invalid OBS scene name");
                statusStore.invalidSceneName = true;
                throw e;
            }
        }
    }

    const getSourceScreenshot = async (sourceName: string) => {
        if (!socket.value) throw Error("OBS Disconnected.");

        const res = await socket.value.call('GetSourceScreenshot', {
            imageFormat: 'png',
            sourceName: sourceName
        });
        console.log("useOBSWebSocket: getSourceScreenshot() response:", res);
        return res;
    }

    const setSceneItemTransform = async (sceneItemId: number, positionX: number, positionY: number) => {
        if (!socket.value) throw Error("OBS Disconnected.");

        const res = await socket.value.call("SetSceneItemTransform", {
            sceneName: configStore.obsSceneName,
            sceneItemId: Number(sceneItemId),
            sceneItemTransform: {
                positionX: positionX,
                positionY: positionY,
            }
        });
        console.log("useOBSWebSocket: setSceneItemTransform() response:", res);
        return res;
    }

    onUnmounted(close);

    return {
        socket,
        connect,
        onOpenCallback,
        close,
        getVideoSettings,
        getSceneItems,
        getSourceScreenshot,
        setSceneItemTransform
    };
}
