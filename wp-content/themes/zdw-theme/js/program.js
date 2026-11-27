(function ($) {

    $(function () {
        $(".program-day-title").click(function() {
            const day = $(this).closest(".program-day");
            const items = day.find(".program-items");
            const trigger = day.find(".program-day-title__trigger");

            items.toggleClass("active");
            trigger.toggleClass("active");
        });

        $(".program-item-collapse").click(function() {
            const item = $(this).closest(".program-item");

            item.removeClass("active");
        })

        $(".program-item-show").click(function() {
            const item = $(this).closest(".program-item");

            item.addClass("active");
        })
    });

})(jQuery);