plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.fnb.posterminal"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fnb.posterminal"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // For demo: ship unsigned release builds; sign before distributing.
            signingConfig = signingConfigs.getByName("debug")
        }
        debug {
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        // AGP 8+ disables AIDL by default; we use it for the Sunmi
        // InnerPrinter service (woyou.aidlservice.jiuiv5.IWoyouService),
        // declared under src/main/aidl/.
        aidl = true
    }

    sourceSets {
        getByName("main") {
            kotlin.srcDirs("src/main/kotlin")
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Sunmi Pay SDK V2 — provides NfcAdapter-equivalent card-read APIs on
    // Sunmi POS devices (and only on Sunmi devices). The aar is binary-only;
    // we commit it to the repo since Sunmi doesn't publish to Maven Central.
    // Requires SPHS (Sunmi Pay Hardware Service) to be installed on the
    // device — pre-installed on every Sunmi POS. On non-Sunmi devices the
    // service bind silently fails and we fall back to standard NfcAdapter.
    implementation(files("libs/PayLib-release-2.0.36.aar"))

    // WebSocket + JSON
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
