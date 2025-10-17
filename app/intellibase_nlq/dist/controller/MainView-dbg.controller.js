sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/StandardListItem",
    "sap/m/MessageBox"
], (Controller, JSONModel, Filter, FilterOperator, StandardListItem, MessageBox) => {
    "use strict";

    return Controller.extend("intellibasenlq.controller.MainView", {
        onInit: async function () {
            this._oODataModel = this.getOwnerComponent().getModel();
            // JSONModels for dropdowns
            this._oCategoryModel = new JSONModel();
            this._oProductModel = new JSONModel();
            this.getView().setModel(this._oCategoryModel, "categoriesModel");
            this.getView().setModel(this._oProductModel, "productsModel");

            // Get controls
            this._oCategorySelect = this.byId("categorySelect");
            this._oProductSelect = this.byId("productSelect");
            this._oPromptList = this.byId("promptList");

            // Load dropdowns and prompts
            await this.loadCategories();
            await this.loadProducts();
            this.loadPrompts("All Categories", "All Products");
        },

        onAfterRendering: function () {
            const oRTE = this.byId("editablePrompt");
            if (oRTE) {
                oRTE.setEditorSettings({
                    menubar: false,
                    toolbar: false,
                    statusbar: false,
                    branding: false,
                    content_style: `
                @font-face {
                    font-family: 'SCProsperSans';
                    src: url('../fonts/SCProsperSans-Regular.woff2') format('woff2'),
                         url('../fonts/SCProsperSans-Regular.ttf') format('truetype');
                    font-weight: 400;
                    font-style: normal;
                }
                body {
                    font-family: 'SCProsperSans', Arial, Helvetica, sans-serif !important;
                    font-size: 14px !important;
                    color: #525355 !important;
                }
                span, sup {
                    font-family: inherit !important;
                }
            `
                });
            }
        },

        // Load distinct categories
        loadCategories: async function () {
            const oBinding = this._oODataModel.bindContext("/DistinctCategories(...)");

            await oBinding.execute();
            const result = oBinding.getBoundContext().getObject();

            const aCategories = result.value || [];
            aCategories.unshift({ category: "All Categories" })

            const oJSONModel = new JSONModel(aCategories);
            this.getView().setModel(oJSONModel, "categories");
        },

        // Load distinct products optionally filtered by category
        loadProducts: async function (category) {
            const oBinding = this._oODataModel.bindContext("/DistinctProducts(...)");

            await oBinding.execute();
            const result = oBinding.getBoundContext().getObject();

            const aProducts = result.value || [];
            aProducts.unshift({ product: "All Products" })

            const oJSONModel = new JSONModel(aProducts);
            this.getView().setModel(oJSONModel, "products");
        },

        // Load prompts list filtered by category/product
        loadPrompts: function (category, product) {
            const aFilters = [];
            if (category && category !== "All Categories") {
                aFilters.push(new Filter("category", FilterOperator.EQ, category));
            }
            if (product && product !== "All Products") {
                aFilters.push(new Filter("product", FilterOperator.EQ, product));
            }
            const oBinding = this._oPromptList.getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters);
            } else {
                this._oPromptList.bindItems({
                    path: "/PromptsData",
                    template: new StandardListItem({
                        title: "{prompt}",
                        description: "{description}"
                    }),
                    filters: aFilters
                });
            }
        },

        // Event handler for category dropdown
        onCategoryChange: function (oEvent) {
            const selectedCategory = oEvent.getParameter("selectedItem")?.getKey();

            // Reload products filtered by category
            // this.loadProducts(selectedCategory);

            // Reload prompts list filtered by category + current product
            const selectedProduct = this._oProductSelect.getSelectedKey();
            this.loadPrompts(selectedCategory, selectedProduct);
        },

        // Event handler for product dropdown
        onProductChange: function (oEvent) {
            const selectedProduct = oEvent.getParameter("selectedItem")?.getKey();
            const selectedCategory = this._oCategorySelect.getSelectedKey();
            // Reload prompts list filtered by category + product
            this.loadPrompts(selectedCategory, selectedProduct);
        },
        onSelectPrompt: async function (oEvent) {
            this.byId("legendSection").setContent("");
            const oContext = oEvent.getParameter("listItem").getBindingContext();
            const oData = oContext.getObject();
            const sPrompt = oData.prompt;
            const oModel = this.getView().getModel();
            const oFunction = oModel.bindContext("/getPrompt(...)");
            oFunction.setParameter("prompt", sPrompt);

            try {
                await oFunction.execute();
                const oResult = oFunction.getBoundContext().getObject();

                // Collect all key fields with values
                const keyEntries = Object.entries(oResult)
                    .filter(([key, value]) => key.startsWith("key") && value);

                // Map keywords to their sel descriptions and assign consistent numbers
                const aKeyFields = keyEntries.map(([key, value], index) => ({
                    value,
                    description: oResult[key.replace("key", "sel")],
                    number: index + 1 // fixed sequence 1,2,3…
                }));

                // Highlight keywords in prompt
                const sHighlightedPrompt = this.highlightKeywords(sPrompt, aKeyFields);
                this.byId("editablePrompt").setValue(sHighlightedPrompt);

                // Build legend HTML
                const colors = ["#0070f2", "#00b050", "#ffb100", "#d62d20", "#a200ff"];
                const sLegendHtml = aKeyFields
                    .filter(k => k.description)
                    .map((k, i) => {
                        const color = colors[i % colors.length];
                        return `
                    <div style="margin-bottom:6px; display:flex; align-items:center;">
                        <span style="
                            display:inline-block;
                            background-color:${color};
                            color:white;
                            font-weight:bold;
                            border-radius:4px;
                            padding:2px 6px;
                            margin-right:8px;
                            font-size:0.9rem;
                        ">${k.number}<sup></sup></span>
                        <span style="font-size:0.9rem; color:#32363a;">
                            ${k.description}
                        </span>
                    </div>
                `;
                    })
                    .join("");

                // Refresh the HTML legend every time
                this.byId("legendSection").setContent(sLegendHtml);

            } catch (err) {
                console.error("Error executing getPrompt:", err);
            }
        },
        highlightKeywords: function (sPromptText, aKeyFields) {
            if (!sPromptText || !aKeyFields || aKeyFields.length === 0) return sPromptText;

            const colors = ["#0070f2", "#00b050", "#ffb100", "#d62d20", "#a200ff"];
            let highlightedText = sPromptText;

            // Replace keywords in the prompt
            aKeyFields.forEach((obj, i) => {
                const keyword = obj.value;
                if (!keyword) return;

                const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const regex = new RegExp(`\\b(${safeKeyword})\\b`, "gi");

                highlightedText = highlightedText.replace(regex, () => {
                    const color = colors[i % colors.length];
                    return `<span style="background-color:${color};color:white;padding:2px 4px;border-radius:4px;">${keyword}<sup>${obj.number}</sup></span>`;
                });
            });

            return highlightedText;
        },
        onSearchLive: function () {
            const selectedCategory = this._oCategorySelect.getSelectedKey();
            const selectedProduct = this._oProductSelect.getSelectedKey();
            this.loadPrompts(selectedCategory, selectedProduct);
        },
        onPressButton: async function () {
            var res = `<p style=\"color:gray;\"><em>✨ Generated by FinSight.Intelligence. Please review before use.</em></p>\n\n<h3>Short Answer:</h3>\nThe total Risk-Weighted Assets (RWA) amount to $57.73B.\n\n<h3>Long Answer:</h3>\n\n<h4>Analysis Steps:</h4>\n<ul>\n    <li>Identified GLB_RWA as the target measure for calculation</li>\n    <li>Performed SUM aggregation on GLB_RWA column</li>\n    <li>Formatted the result in billions (B) for better readability</li>\n</ul>\n\n<table style=\"border-collapse: collapse; width: 100%; border: 1px solid #ddd;\">\n    <thead>\n        <tr style=\"background-color: #f2f2f2;\">\n            <th style=\"padding: 8px; text-align: left; border: 1px solid #ddd;\">Measure</th>\n            <th style=\"padding: 8px; text-align: right; border: 1px solid #ddd;\">Value</th>\n        </tr>\n    </thead>\n    <tbody>\n        <tr>\n            <td style=\"padding: 8px; text-align: left; border: 1px solid #ddd;\">Total RWA</td>\n            <td style=\"padding: 8px; text-align: right; border: 1px solid #ddd;\">$57,730,482,199.95</td>\n        </tr>\n    </tbody>\n</table>`
            this.byId("htmlContent").setContent(res);

            // var prompt = this.byId("editablePrompt").getValue();
            // const plainText = prompt
            //     .replace(/<sup>.*?<\/sup>/g, '')  // remove superscripts
            //     .replace(/<[^>]+>/g, '')          // remove all HTML tags
            //     .trim();

            // const oModel = this.getView().getModel();
            // const oFunction = oModel.bindContext("/getAPIResponse(...)");

            // oFunction.setParameter("prompt", plainText);

            // try {
            //     await oFunction.execute();
            //     const oResult = oFunction.getBoundContext().getObject();
            //     const data = await oResult.json();
            //     this.byId("htmlContent").setContent(data.FINAL_RESULT);
            // } catch (err) {
            //     console.log("Catch of AskFinsigh:", err);
            //     MessageBox.error("Failed to fetch response due to: ", err)
            // }
        }
    });
});