# Reglas de Proguard para PapaSense
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.papasense.app.** { *; }
