sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/StandardListItem",
    "sap/m/MessageBox",
    "sap/m/BusyDialog",
    "../lib/jspdf/jspdf.umd.min",
    "../lib/dompurify/purify.min",
    "../lib/html2canvas/html2canvas.min"
], (Controller, JSONModel, Filter, FilterOperator, StandardListItem, MessageBox, BusyDialog) => {
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

                let aKeyFields = keyEntries.map(([key, value], index) => ({
                    value,
                    description: oResult[key.replace("key", "sel")],
                    number: index + 1 // temporary numbering
                }));

                // 🔹 Determine order of appearance in the prompt
                aKeyFields = aKeyFields
                    .map(obj => {
                        const index = sPrompt.toLowerCase().indexOf(obj.value.toLowerCase());
                        return index >= 0 ? { ...obj, index } : null;
                    })
                    .filter(Boolean)
                    .sort((a, b) => a.index - b.index)
                    .map((obj, i) => ({ ...obj, number: i + 1 })); // reassign numbering

                // Highlight keywords in prompt (already ordered)
                const sHighlightedPrompt = this.highlightKeywords(sPrompt, aKeyFields);
                this.byId("editablePrompt").setValue(sHighlightedPrompt);

                // 🔹 Build legend HTML based on the same ordered list
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
                        ">${k.number}</span>
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

            // 🔹 Use already ordered aKeyFields (no need to sort again)
            aKeyFields.forEach((obj, i) => {
                const keyword = obj.value;
                if (!keyword) return;

                const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const regex = new RegExp(`\\b(${safeKeyword})\\b`, "gi");
                const color = colors[i % colors.length];

                highlightedText = highlightedText.replace(regex, match => {
                    return `<span style="background-color:${color};color:white;padding:2px 4px;border-radius:4px;">${match}<sup>${obj.number}</sup></span>`;
                });
            });

            return highlightedText;
        },
        onSearchLive: function () {
            const selectedCategory = this._oCategorySelect.getSelectedKey();
            const selectedProduct = this._oProductSelect.getSelectedKey();
            this.loadPrompts(selectedCategory, selectedProduct);
        },
        getBaseUrl: function () {
            return sap.ui.require.toUrl('intellibasenlq');
        },
        fetchCsrfToken: async function () {
            let url = this.getBaseUrl();
            const response = await fetch(url, {
                method: "HEAD",
                credentials: "include",
                headers: {
                    "X-CSRF-Token": "Fetch"
                }
            })
            const token = response.headers.get("X-CSRF-Token");
            return token;
        },
        onPressButton: async function () {
            const userInput = this.byId("editablePrompt").getValue();
            const oView = this.getView();
            if (!userInput) {
                MessageBox.error("Please select a prompt to proceed!");
                return;
            }
            const sInput = userInput
                .replace(/<sup>.*?<\/sup>/gi, "")   // remove superscripts entirely
                .replace(/<[^>]*>/g, "")            // remove all HTML tags
                .trim();
            // Create and show busy dialog
            const oBusyDialog = new sap.m.BusyDialog({
                title: "Busy Indicator",
                text: "Generating response. Please standby.."
            });
            oBusyDialog.open();

            // Freeze the screen
            oView.setBusy(true);
            await Promise.resolve();

            try {
                const resp = await this.onfetchData(sInput);
                this.byId("htmlContent").setContent(resp);
            } catch (err) {
                console.error("Chat fetch error:", err);
                MessageBox.error("Failed to get API response due to: ", err);
            } finally {
                oBusyDialog.close();
                oView.setBusy(false);
            }
        },
        onfetchData: async function (sInput) {
            const chatUrl = this.getBaseUrl() + "/api/chat";
            const thisUser = this.getBaseUrl() + "/user-api/currentUser";
            var payload;
            const csrf = this.fetchCsrfToken();
            this.byId("htmlContent").setContent("");
            const controller = new AbortController();
            const timeout = setTimeout(() => {
                controller.abort(); // Aborts the request after 90s
            }, 90000);

            //get user details to fetch bankID
            const user = await fetch(thisUser, {
                method: "GET",
                headers: {
                    "X-CSRF-Token": csrf,
                    "Content-Type": "application/json"
                }
            })
            if (!user.ok) {
                MessageBox.error("Not a valid user");
                return;
            }
            const userDetails = await user.json();
            const bankId = userDetails.name;

            payload = { "message": "user_id:" + bankId + ":Intellibase " + sInput };

            try {
                const response = await fetch(chatUrl, {
                    method: "POST",
                    headers: {
                        "X-CSRF-Token": csrf,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                clearTimeout(timeout);

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                const data = await response.json();
                const isHTMlString = data.FINAL_RESULT === "string" && /<[^>]+>/.test(data.FINAL_RESULT);
                var finalres;
                if (!isHTMlString) {
                    finalres = `<p style="color:red;">${data.FINAL_RESULT}</p>`
                }
                else
                    finalres = finalres +
                        "<div style='margin-top:1rem; font-family: monospace; white-space: pre-wrap;'>" +
                        "<strong>SQL Query:</strong><br/>" +
                        data.SQL_QUERY +
                        "</div>";

                return finalres;
            } catch (err) {
                console.log("inside catch of askFinsight", err);
            }
        },
        onChatCopy: function () {
            const oChatBox = this.byId("ChatBotResult");
            const domRef = oChatBox?.getDomRef();

            if (!domRef) {
                sap.m.MessageToast.show("Nothing to copy");
                return;
            }

            const message = domRef.innerText;

            if (navigator?.clipboard && message) {
                navigator.clipboard
                    .writeText(message)
                    .then(() => {
                        sap.m.MessageToast.show("Text copied to clipboard");
                    })
                    .catch((err) => {
                        console.error("Copy failed", err);
                        sap.m.MessageToast.show("Failed to copy text.");
                    });
            }
        },
        onChatExport: async function () {
            if (!window.jspdf || !window.html2canvas) {
                sap.m.MessageToast.show("Required libraries not loaded.");
                return;
            }

            const { jsPDF } = window.jspdf;
            const userInput = this.byId("editablePrompt").getValue() || "";
            const plainText = userInput
                .replace(/<sup>.*?<\/sup>/gi, "")   // remove superscripts entirely
                .replace(/<[^>]*>/g, "")            // remove all HTML tags
                .trim();
            const domRef = this.byId("ChatBotResult")?.getDomRef();
            if (!domRef) {
                sap.m.MessageToast.show("No content to export");
                return;
            }

            // --- Create hidden container ---
            const wrapper = document.createElement("div");
            wrapper.style.width = "794px"; // A4 width in px at 96 DPI
            wrapper.style.padding = "20px";
            wrapper.style.background = "#fff";
            wrapper.style.fontFamily = "Arial, sans-serif";
            wrapper.style.position = "absolute";
            wrapper.style.top = "0";
            wrapper.style.left = "-9999px";
            document.body.appendChild(wrapper);

            // --- User Input Section ---
            const userInputBox = document.createElement("div");
            userInputBox.style.background = "linear-gradient(to right, #e8f0ff, #f2f6fd)";
            userInputBox.style.padding = "16px 24px";
            userInputBox.style.borderRadius = "8px";
            userInputBox.style.marginBottom = "24px";
            userInputBox.style.border = "1px solid #cdddfb";

            const headerText = document.createElement("div");
            headerText.textContent = "USER INPUT";
            headerText.style.fontSize = "18px";
            headerText.style.fontWeight = "bold";
            headerText.style.color = "#1a73e8";
            headerText.style.marginBottom = "8px";

            const userInputText = document.createElement("div");
            userInputText.textContent = plainText;
            userInputText.style.fontSize = "14px";
            userInputText.style.color = "#333";

            userInputBox.appendChild(headerText);
            userInputBox.appendChild(userInputText);
            wrapper.appendChild(userInputBox);

            // --- Clone Chat Response ---
            const responseClone = domRef.cloneNode(true);
            responseClone.style.margin = "0"; // prevent extra spacing
            wrapper.appendChild(responseClone);

            // --- Wait for DOM to layout ---
            await new Promise(resolve => requestAnimationFrame(resolve));

            try {
                const canvas = await html2canvas(wrapper, {
                    scale: 2,
                    useCORS: true,
                    scrollY: 0,
                    windowWidth: wrapper.scrollWidth,
                    height: wrapper.scrollHeight
                });

                const imgData = canvas.toDataURL("image/png");
                const pdf = new jsPDF("p", "pt", "a4");
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();

                const imgWidth = pdfWidth;
                const imgHeight = (canvas.height * pdfWidth) / canvas.width;

                let heightLeft = imgHeight;
                let position = 0;

                pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;

                while (heightLeft > 0) {
                    position -= pdfHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                    heightLeft -= pdfHeight;
                }

                pdf.save("IntellibaseNLQ_Chat_Export.pdf");
                sap.m.MessageToast.show("PDF exported successfully");

            } catch (err) {
                console.error("PDF export failed", err);
                sap.m.MessageToast.show("Failed to export PDF");
            } finally {
                document.body.removeChild(wrapper);
            }
        }
    });
});