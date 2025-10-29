sap.ui.define([
    "sap/ui/core/UIComponent",
    "intellibasenlq/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("intellibasenlq.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();

            var appId = this.getManifestEntry("/sap.app/id");
            var appPath = appId.replaceAll(".", "/");
            var appModulePath = jQuery.sap.getModulePath(appPath);
            let oImageModel = new sap.ui.model.json.JSONModel({
                path: appModulePath,
            });

            this.setModel(oImageModel, "imageModel");

            this.getModel().refresh();
        }
    });
});