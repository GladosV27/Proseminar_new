package de.tudortmund.noesis;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NoesisNativeLlmPlugin.class);
        registerPlugin(NoesisSpeechPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
