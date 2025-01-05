# swim_data_analyser/urls.py
from django.contrib import admin
from django.urls import path
from . import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.index, name='index'),
    path('about.html', views.about, name='about'),
    path('getDefaultData', views.get_default_data, name='get_default_data'),
    path('encode_js_object_to_fit', views.encode_js_object_to_fit, name='encode_js_object_to_fit'),
]
