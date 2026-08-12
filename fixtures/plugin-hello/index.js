// fixture 外掛：驗證載入鏈（sha256→blob script→activate→面板渲染）
(function () {
    const React = window.SJP_React;
    function HelloPanel(props) {
        return React.createElement(
            'div',
            { style: { padding: 12 } },
            'Hello from plugin — code=' + (props.code ?? '無'),
        );
    }
    window.SJP_PLUGIN = {
        activate: function (host) {
            host.ui.toast('hello 外掛已載入');
            return {
                panels: [
                    {
                        key: 'hello',
                        label: 'Hello 外掛',
                        pinnable: true,
                        singleton: false,
                        defaultSize: { w: 4, h: 6, minW: 2, minH: 3 },
                        Component: HelloPanel,
                    },
                ],
            };
        },
    };
})();
