package com.papasense.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;

public class MainActivity extends Activity {

    // UUID estándar para Bluetooth Serial SPP (Serial Port Profile) usado por HC-05
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int REQUEST_BLUETOOTH_PERMISSIONS = 101;
    private static final int REQUEST_ENABLE_BT = 102;

    private WebView webView;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket bluetoothSocket;
    private Thread workerThread;
    private volatile boolean isReading = false;
    private Handler mainHandler;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        mainHandler = new Handler(Looper.getMainLooper());
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // Añadir puente Javascript -> Android
        webView.addJavascriptInterface(new AndroidBluetoothBridge(), "AndroidBluetooth");

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        // Cargar aplicación desde assets
        webView.loadUrl("file:///android_asset/index.html");

        checkAndRequestPermissions();
    }

    private void checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.BLUETOOTH_CONNECT,
                        Manifest.permission.BLUETOOTH_SCAN
                }, REQUEST_BLUETOOTH_PERMISSIONS);
            }
        } else {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }, REQUEST_BLUETOOTH_PERMISSIONS);
            }
        }
    }

    /**
     * Interfaz expuesta a JavaScript como `window.AndroidBluetooth`
     */
    public class AndroidBluetoothBridge {

        @JavascriptInterface
        public boolean isNativeAndroid() {
            return true;
        }

        @JavascriptInterface
        public void connectBluetooth() {
            mainHandler.post(() -> showDevicePicker());
        }

        @JavascriptInterface
        public void disconnectBluetooth() {
            disconnect();
        }
    }

    private void showDevicePicker() {
        if (bluetoothAdapter == null) {
            Toast.makeText(this, "Este dispositivo no soporta Bluetooth", Toast.LENGTH_SHORT).show();
            notifyDisconnected("Sin hardware Bluetooth");
            return;
        }

        if (!bluetoothAdapter.isEnabled()) {
            Intent enableBtIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
            startActivityForResult(enableBtIntent, REQUEST_ENABLE_BT);
            return;
        }

        // Obtener dispositivos vinculados
        Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
        if (pairedDevices == null || pairedDevices.isEmpty()) {
            Toast.makeText(this, "No hay dispositivos Bluetooth vinculados. Vincula el HC-05 en Ajustes de Android primero.", Toast.LENGTH_LONG).show();
            notifyDisconnected("Sin dispositivos vinculados");
            return;
        }

        final ArrayList<BluetoothDevice> deviceList = new ArrayList<>(pairedDevices);
        String[] deviceNames = new String[deviceList.size()];
        int defaultSelection = 0;

        for (int i = 0; i < deviceList.size(); i++) {
            BluetoothDevice device = deviceList.get(i);
            String name = device.getName() != null ? device.getName() : "Desconocido";
            deviceNames[i] = name + "\n" + device.getAddress();
            if (name.toUpperCase().contains("HC-05") || name.toUpperCase().contains("PAPASENSE")) {
                defaultSelection = i;
            }
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Seleccione el Módulo HC-05");
        builder.setSingleChoiceItems(deviceNames, defaultSelection, null);
        builder.setPositiveButton("Conectar", (dialog, which) -> {
            int selectedPosition = ((AlertDialog) dialog).getListView().getCheckedItemPosition();
            if (selectedPosition >= 0 && selectedPosition < deviceList.size()) {
                BluetoothDevice selectedDevice = deviceList.get(selectedPosition);
                connectToDevice(selectedDevice);
            }
        });
        builder.setNegativeButton("Cancelar", (dialog, which) -> {
            notifyDisconnected("Conexión cancelada");
        });
        builder.show();
    }

    private synchronized void connectToDevice(BluetoothDevice device) {
        disconnect();

        Toast.makeText(this, "Conectando con " + device.getName() + "...", Toast.LENGTH_SHORT).show();

        workerThread = new Thread(() -> {
            try {
                // Cancelar descubrimiento para mejorar velocidad de conexión
                if (bluetoothAdapter.isDiscovering()) {
                    bluetoothAdapter.cancelDiscovery();
                }

                bluetoothSocket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                bluetoothSocket.connect();

                isReading = true;
                final String devName = device.getName();
                final String devAddr = device.getAddress();

                mainHandler.post(() -> notifyConnected(devName, devAddr));

                InputStream inStream = bluetoothSocket.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(inStream));

                String line;
                while (isReading && (line = reader.readLine()) != null) {
                    final String telemetryLine = line.trim();
                    if (!telemetryLine.isEmpty()) {
                        mainHandler.post(() -> sendDataToJS(telemetryLine));
                    }
                }

            } catch (Exception e) {
                final String errMsg = e.getMessage();
                mainHandler.post(() -> {
                    Toast.makeText(MainActivity.this, "Error de conexión Bluetooth: " + errMsg, Toast.LENGTH_SHORT).show();
                    notifyDisconnected(errMsg);
                });
                disconnect();
            }
        });
        workerThread.start();
    }

    private synchronized void disconnect() {
        isReading = false;
        try {
            if (bluetoothSocket != null) {
                bluetoothSocket.close();
                bluetoothSocket = null;
            }
        } catch (Exception ignored) {}

        if (workerThread != null) {
            workerThread.interrupt();
            workerThread = null;
        }
    }

    private void notifyConnected(String name, String mac) {
        String script = "if (window.onAndroidBluetoothConnected) { window.onAndroidBluetoothConnected('" + escapeJS(name) + "', '" + escapeJS(mac) + "'); }";
        webView.evaluateJavascript(script, null);
    }

    private void notifyDisconnected(String reason) {
        String script = "if (window.onAndroidBluetoothDisconnected) { window.onAndroidBluetoothDisconnected('" + escapeJS(reason) + "'); }";
        webView.evaluateJavascript(script, null);
    }

    private void sendDataToJS(String line) {
        String script = "if (window.onAndroidBluetoothData) { window.onAndroidBluetoothData('" + escapeJS(line) + "'); }";
        webView.evaluateJavascript(script, null);
    }

    private String escapeJS(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "");
    }

    @Override
    protected void onDestroy() {
        disconnect();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
